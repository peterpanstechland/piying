"""
FastAPI application entry point for Shadow Puppet Interactive System
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="Shadow Puppet Interactive System API",
    description="Backend API for motion capture and video rendering",
    version="0.1.0"
)

# Configure CORS for LAN access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for LAN deployment
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    """Root endpoint"""
    return {"message": "Shadow Puppet Interactive System API", "status": "running"}

@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "disk_space_gb": 0,  # TODO: Implement disk space check
        "active_sessions": 0  # TODO: Implement session count
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
