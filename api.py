import json
import os

from fastapi import FastAPI, HTTPException
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from agents import build_reader_agent, build_search_agent, writer_chain, critic_chain
from pipeline import run_research_pipeline

# ── App setup ─────────────────────────────────────────────────────────────────
app = FastAPI(title="ResearchMind API", version="1.0.0")

allowed_origins = os.getenv(
    "FRONTEND_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in allowed_origins if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ResearchRequest(BaseModel):
    topic: str


def _validate(topic: str) -> str:
    topic = topic.strip()
    if not topic:
        raise HTTPException(status_code=400, detail="Please enter a research topic first.")
    return topic


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


# ── Pipeline steps (same logic as app.py) ─────────────────────────────────────
def _search_step(topic_val: str) -> str:
    search_agent = build_search_agent()
    sr = search_agent.invoke({
        "messages": [("user", f"Find recent, reliable and detailed information about: {topic_val}")]
    })
    return sr["messages"][-1].text


def _reader_step(topic_val: str, search: str) -> str:
    reader_agent = build_reader_agent()
    rr = reader_agent.invoke({
        "messages": [("user",
            f"Based on the following search results about '{topic_val}', "
            f"pick the most relevant URL and scrape it for deeper content.\n\n"
            f"Search Results:\n{search[:800]}"
        )]
    })
    return rr["messages"][-1].text


def _writer_step(topic_val: str, search: str, reader: str) -> str:
    research_combined = (
        f"SEARCH RESULTS:\n{search}\n\n"
        f"DETAILED SCRAPED CONTENT:\n{reader}"
    )
    return writer_chain.invoke({
        "topic": topic_val,
        "research": research_combined
    })


def _critic_step(report: str) -> str:
    return critic_chain.invoke({
        "report": report
    })


# ── Routes ────────────────────────────────────────────────────────────────────
@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/research")
async def research(req: ResearchRequest):
    """Run the full pipeline and return every step's output at once."""
    topic = _validate(req.topic)
    state = await run_in_threadpool(run_research_pipeline, topic)
    return {
        "topic": topic,
        "search": state["search_results"],
        "reader": state["scraped_content"],
        "writer": state["report"],
        "critic": state["feedback"],
    }


@app.post("/api/research/stream")
async def research_stream(req: ResearchRequest):
    """Run the pipeline step by step, streaming progress as Server-Sent Events."""
    topic_val = _validate(req.topic)

    async def events():
        results = {}
        current = "search"
        try:
            yield _sse({"type": "step", "step": "search", "status": "running"})
            results["search"] = await run_in_threadpool(_search_step, topic_val)
            yield _sse({"type": "step", "step": "search", "status": "done", "output": results["search"]})

            current = "reader"
            yield _sse({"type": "step", "step": "reader", "status": "running"})
            results["reader"] = await run_in_threadpool(_reader_step, topic_val, results["search"])
            yield _sse({"type": "step", "step": "reader", "status": "done", "output": results["reader"]})

            current = "writer"
            yield _sse({"type": "step", "step": "writer", "status": "running"})
            results["writer"] = await run_in_threadpool(
                _writer_step, topic_val, results["search"], results["reader"]
            )
            yield _sse({"type": "step", "step": "writer", "status": "done", "output": results["writer"]})

            current = "critic"
            yield _sse({"type": "step", "step": "critic", "status": "running"})
            results["critic"] = await run_in_threadpool(_critic_step, results["writer"])
            yield _sse({"type": "step", "step": "critic", "status": "done", "output": results["critic"]})

            yield _sse({"type": "complete"})
        except Exception as e:
            yield _sse({"type": "error", "step": current, "message": str(e)})

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=True)
