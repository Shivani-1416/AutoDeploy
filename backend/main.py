from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

import requests
import os
import re
import uuid


# ============================================
# ENVIRONMENT
# ============================================

load_dotenv()

JENKINS_URL = os.getenv(
    "JENKINS_URL",
    "http://jenkins:8080"
).rstrip("/")

JENKINS_PUBLIC_URL = os.getenv(
    "JENKINS_PUBLIC_URL",
    "http://localhost:8080"
).rstrip("/")

JENKINS_TRIGGER_TOKEN = os.getenv(
    "JENKINS_TRIGGER_TOKEN",
    "autodeploy-trigger"
)

JENKINS_JOB = os.getenv(
    "JENKINS_JOB",
    "AutoDeploy-project-job"
)


# ============================================
# FASTAPI
# ============================================

app = FastAPI(
    title="AutoDeploy Platform API"
)


# ============================================
# CORS
# ============================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)


# ============================================
# REQUEST MODEL
# ============================================

class DeploymentRequest(BaseModel):
    repository: str
    branch: str = "main"


# ============================================
# DEPLOYMENT STORAGE
# ============================================

deployments = {}


# ============================================
# ROOT
# ============================================

@app.get("/")
def root():
    return {
        "message": "AutoDeploy backend is running"
    }


# ============================================
# START DEPLOYMENT
# ============================================

@app.post("/deploy")
def deploy(request: DeploymentRequest):

    # ----------------------------------------
    # Validate GitHub URL
    # ----------------------------------------

    if not re.match(
        r"^https://github\.com/[\w.-]+/[\w.-]+/?(?:\.git)?$",
        request.repository
    ):
        raise HTTPException(
            status_code=400,
            detail="Invalid GitHub repository URL"
        )

    if not request.branch:
        raise HTTPException(
            status_code=400,
            detail="Branch is required"
        )

    # ----------------------------------------
    # Jenkins remote build trigger
    # ----------------------------------------

    trigger_url = (
        f"{JENKINS_URL}/buildByToken/buildWithParameters"
    )

    params = {
        "job": JENKINS_JOB,
        "token": JENKINS_TRIGGER_TOKEN,
        "REPOSITORY": request.repository,
        "BRANCH": request.branch
    }

    try:

        response = requests.post(
            trigger_url,
            params=params,
            timeout=15,
            allow_redirects=False
        )

    except requests.RequestException as e:

        raise HTTPException(
            status_code=502,
            detail=f"Could not connect to Jenkins: {str(e)}"
        )

    # ----------------------------------------
    # Check Jenkins response
    # ----------------------------------------

    if response.status_code not in (
        200,
        201,
        202
    ):

        raise HTTPException(
            status_code=502,
            detail=(
                "Jenkins rejected deployment: "
                f"{response.status_code} "
                f"{response.text[:300]}"
            )
        )

    # ----------------------------------------
    # Jenkins returns queue URL
    # ----------------------------------------

    location = response.headers.get(
        "Location",
        ""
    )

    match = re.search(
        r"/queue/item/(\d+)/?",
        location
    )

    if not match:

        raise HTTPException(
            status_code=502,
            detail=(
                "Jenkins accepted the request "
                "but no queue ID was returned."
            )
        )

    queue_id = match.group(1)

    # ----------------------------------------
    # Create deployment ID
    # ----------------------------------------

    deployment_id = str(
        uuid.uuid4()
    )

    deployments[deployment_id] = {

        "queue_id":
            queue_id,

        "repository":
            request.repository,

        "branch":
            request.branch
    }

    return {

        "message":
            "Deployment queued",

        "deployment_id":
            deployment_id,

        "queue_id":
            queue_id,

        "repository":
            request.repository,

        "branch":
            request.branch
    }


# ============================================
# DEPLOYMENT STATUS
# ============================================

@app.get(
    "/deploy/status/{deployment_id}"
)
def deployment_status(
    deployment_id: str
):

    deployment = deployments.get(
        deployment_id
    )

    if not deployment:

        raise HTTPException(
            status_code=404,
            detail="Deployment not found"
        )

    queue_id = deployment[
        "queue_id"
    ]

    # ========================================
    # CHECK JENKINS QUEUE
    # ========================================

    try:

        queue_response = requests.get(

            f"{JENKINS_URL}/queue/"
            f"item/{queue_id}/api/json",

            timeout=10
        )

    except requests.RequestException as e:

        raise HTTPException(
            status_code=502,
            detail=(
                "Could not connect to Jenkins queue: "
                f"{str(e)}"
            )
        )

    if not queue_response.ok:

        raise HTTPException(
            status_code=502,
            detail="Could not read Jenkins queue."
        )

    queue_data = queue_response.json()

    # ========================================
    # QUEUE CANCELLED
    # ========================================

    if queue_data.get("cancelled"):

        return {

            "status":
                "failed",

            "result":
                "ABORTED",

            "build_number":
                None,

            "logs":
                "Jenkins queue item was cancelled.",

            "console_url":
                "",

            "repository":
                deployment["repository"],

            "branch":
                deployment["branch"]
        }

    # ========================================
    # WAITING FOR JENKINS
    # ========================================

    executable = queue_data.get(
        "executable"
    )

    if not executable:

        return {

            "status":
                "queued",

            "result":
                None,

            "build_number":
                None,

            "logs":
                "Waiting for Jenkins executor...\n",

            "console_url":
                "",

            "repository":
                deployment["repository"],

            "branch":
                deployment["branch"]
        }

    # ========================================
    # BUILD NUMBER
    # ========================================

    build_number = executable[
        "number"
    ]

    # ========================================
    # GET BUILD INFORMATION
    # ========================================

    try:

        build_response = requests.get(

            f"{JENKINS_URL}/job/"
            f"{JENKINS_JOB}/"
            f"{build_number}/api/json",

            timeout=10
        )

    except requests.RequestException as e:

        raise HTTPException(
            status_code=502,
            detail=(
                "Could not connect to Jenkins build: "
                f"{str(e)}"
            )
        )

    if not build_response.ok:

        raise HTTPException(
            status_code=502,
            detail="Could not read Jenkins build."
        )

    build_data = build_response.json()

    # ========================================
    # GET REAL JENKINS LOG
    # ========================================

    try:

        console_response = requests.get(

            f"{JENKINS_URL}/job/"
            f"{JENKINS_JOB}/"
            f"{build_number}/consoleText",

            timeout=15
        )

        if console_response.ok:

            logs = console_response.text

        else:

            logs = (
                "Unable to read Jenkins console."
            )

    except requests.RequestException:

        logs = (
            "Unable to read Jenkins console."
        )

    # ========================================
    # DETERMINE STATUS
    # ========================================

    if build_data.get("building"):

        status = "building"

    elif build_data.get("result") == "SUCCESS":

        status = "success"

    else:

        status = "failed"

    # ========================================
    # JENKINS CONSOLE URL
    # ========================================

    console_url = (

        f"{JENKINS_PUBLIC_URL}/job/"
        f"{JENKINS_JOB}/{build_number}/console"
    )

    return {

        "status":
            status,

        "result":
            build_data.get("result"),

        "build_number":
            build_number,

        "logs":
            logs,

        "console_url":
            console_url,

        "repository":
            deployment["repository"],

        "branch":
            deployment["branch"]
    }