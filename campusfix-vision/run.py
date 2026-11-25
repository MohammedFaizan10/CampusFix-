"""
run.py - Convenience script to start the CampusFix+ Vision microservice.
Usage:
    python run.py
"""

import uvicorn
from app.config import settings

if __name__ == "__main__":
    print(f"Starting CampusFix+ Computer Vision service on http://localhost:{settings.PORT}")
    print(f"Interactive Swagger documentation available at http://localhost:{settings.PORT}/docs")
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG
    )

