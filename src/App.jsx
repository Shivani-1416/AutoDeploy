import { useEffect, useRef, useState } from "react";

const API_URL = "http://127.0.0.1:8000";

const DEPLOYED_APP_URL = "http://localhost:8081";


// =====================================================
// PIPELINE STAGES
// =====================================================

const PIPELINE_STAGES = [
  {
    id: "github",
    icon: "🐙",
    name: "GitHub Pull"
  },
  {
    id: "docker",
    icon: "🐳",
    name: "Docker Build"
  },
  {
    id: "registry",
    icon: "📦",
    name: "Docker Hub Push"
  },
  {
    id: "ansible",
    icon: "⚙️",
    name: "Ansible Deploy"
  },
  {
    id: "application",
    icon: "🌐",
    name: "Application Live"
  }
];


// =====================================================
// DETERMINE PIPELINE STATUS FROM JENKINS LOGS
// =====================================================

function getPipelineStages(logs, deploymentStatus) {

  const text = (logs || "").toLowerCase();

  const stages = PIPELINE_STAGES.map(stage => ({
    ...stage,
    status: "pending"
  }));


  // ---------------------------------------------------
  // GITHUB
  // ---------------------------------------------------

  if (
    text.includes("repository cloned successfully") ||
    text.includes("dockerfile found")
  ) {
    stages[0].status = "success";
  }

  else if (
    text.includes("cloning github repository") ||
    text.includes("cloning into")
  ) {
    stages[0].status = "running";
  }


  // ---------------------------------------------------
  // DOCKER BUILD
  // ---------------------------------------------------

  if (
    text.includes("docker image built successfully") ||
    text.includes("docker build completed")
  ) {
    stages[1].status = "success";
  }

  else if (
    text.includes("building docker image") ||
    text.includes("docker build")
  ) {
    stages[1].status = "running";
  }


  // ---------------------------------------------------
  // DOCKER HUB
  // ---------------------------------------------------

  if (
    text.includes("docker image pushed successfully") ||
    text.includes("pushed successfully")
  ) {
    stages[2].status = "success";
  }

  else if (
    text.includes("pushing docker image") ||
    text.includes("docker push")
  ) {
    stages[2].status = "running";
  }


  // ---------------------------------------------------
  // ANSIBLE
  // ---------------------------------------------------

  if (
    text.includes("ansible deployment completed") ||
    text.includes("play recap")
  ) {
    stages[3].status = "success";
  }

  else if (
    text.includes("starting ansible deployment") ||
    text.includes("ansible-playbook") ||
    text.includes("play [")
  ) {
    stages[3].status = "running";
  }


  // ---------------------------------------------------
  // APPLICATION
  // ---------------------------------------------------

  if (
    deploymentStatus === "success" ||
    text.includes("finished: success")
  ) {
    stages[4].status = "success";
  }

  else if (
    text.includes("starting application") ||
    text.includes("container started")
  ) {
    stages[4].status = "running";
  }


  // ---------------------------------------------------
  // FAILURE DETECTION
  // ---------------------------------------------------

  if (deploymentStatus === "failed") {

    // Find the most likely failed stage

    if (
      text.includes("docker build failed") ||
      text.includes("error: docker build")
    ) {
      stages[1].status = "failed";
    }

    else if (
      text.includes("docker push failed") ||
      text.includes("error: docker push")
    ) {
      stages[2].status = "failed";
    }

    else if (
      text.includes("ansible deployment failed") ||
      text.includes("failed=1")
    ) {
      stages[3].status = "failed";
    }

    else if (
      text.includes("git clone failed") ||
      text.includes("remote branch") ||
      text.includes("fatal:")
    ) {
      stages[0].status = "failed";
    }

    else {
      // If exact stage isn't known,
      // mark the current running stage as failed.

      const runningStage =
        stages.find(
          stage => stage.status === "running"
        );

      if (runningStage) {
        runningStage.status = "failed";
      }
    }
  }


  return stages;
}


// =====================================================
// PIPELINE COMPONENT
// =====================================================

function DeploymentPipeline({ logs, status }) {

  const stages =
    getPipelineStages(
      logs,
      status
    );


  return (

    <section className="pipeline-card">

      <div className="pipeline-title">

        <div>

          <h2>
            Deployment Pipeline
          </h2>

          <p>
            Live Jenkins deployment progress
          </p>

        </div>


        <div className="live-indicator">

          <span></span>

          Live

        </div>

      </div>


      <div className="pipeline">

        {stages.map(
          (stage, index) => (

            <div
              className="pipeline-stage-wrapper"
              key={stage.id}
            >

              <div
                className={
                  `pipeline-stage ${stage.status}`
                }
              >

                <div className="stage-circle">

                  {stage.status === "success"
                    ? "✓"
                    : stage.status === "failed"
                    ? "✕"
                    : stage.icon
                  }

                </div>


                <div className="stage-info">

                  <strong>
                    {stage.name}
                  </strong>


                  <span>

                    {stage.status === "success"
                      ? "Completed"
                      : stage.status === "running"
                      ? "Running..."
                      : stage.status === "failed"
                      ? "Failed"
                      : "Waiting"
                    }

                  </span>

                </div>

              </div>


              {index <
                stages.length - 1 && (

                <div
                  className={
                    `pipeline-line ${
                      stages[index].status ===
                      "success"
                        ? "completed"
                        : ""
                    }`
                  }
                ></div>

              )}

            </div>

          )
        )}

      </div>


      {/* SIMPLE STATUS */}

      <div className="pipeline-summary">

        {status === "success" && (

          <span className="summary-success">

            ✓ Deployment completed successfully

          </span>

        )}


        {status === "failed" && (

          <span className="summary-failed">

            ✕ Deployment failed

          </span>

        )}


        {(status === "queued" ||
          status === "building") && (

          <span className="summary-running">

            ● Deployment in progress...

          </span>

        )}

      </div>

    </section>

  );
}


// =====================================================
// MAIN APP
// =====================================================

function App() {

  const [repository, setRepository] =
    useState("");

  const [branch, setBranch] =
    useState("main");

  const [deploymentId, setDeploymentId] =
    useState(null);

  const [buildNumber, setBuildNumber] =
    useState(null);

  const [status, setStatus] =
    useState("idle");

  const [logs, setLogs] =
    useState("");

  const [consoleUrl, setConsoleUrl] =
    useState("");

  const [error, setError] =
    useState("");

  const logRef =
    useRef(null);

  const timerRef =
    useRef(null);


  // ===================================================
  // AUTO SCROLL LOGS
  // ===================================================

  useEffect(() => {

    if (logRef.current) {

      logRef.current.scrollTop =
        logRef.current.scrollHeight;

    }

  }, [logs]);


  // ===================================================
  // CLEANUP
  // ===================================================

  useEffect(() => {

    return () => {

      if (timerRef.current) {

        clearInterval(
          timerRef.current
        );

      }

    };

  }, []);


  // ===================================================
  // START DEPLOYMENT
  // ===================================================

  const startDeployment =
    async (e) => {

      e.preventDefault();


      setError("");

      setLogs("");

      setBuildNumber(null);

      setConsoleUrl("");

      setDeploymentId(null);

      setStatus("queued");


      // Validate repository

      if (!repository.trim()) {

        setError(
          "Please enter a GitHub repository URL."
        );

        setStatus("idle");

        return;
      }


      if (
        !repository
          .trim()
          .startsWith(
            "https://github.com/"
          )
      ) {

        setError(
          "Please enter a valid GitHub repository URL."
        );

        setStatus("idle");

        return;
      }


      try {

        const response =
          await fetch(
            `${API_URL}/deploy`,
            {

              method: "POST",

              headers: {
                "Content-Type":
                  "application/json"
              },

              body: JSON.stringify({

                repository:
                  repository.trim(),

                branch:
                  branch.trim() ||
                  "main"

              })

            }
          );


        const data =
          await response.json();


        if (!response.ok) {

          throw new Error(
            data.detail ||
            "Deployment request failed."
          );

        }


        setDeploymentId(
          data.deployment_id
        );


        startPolling(
          data.deployment_id
        );


      }

      catch (err) {

        console.error(err);

        setStatus("failed");

        setError(
          err.message ||
          "Could not connect to FastAPI."
        );

      }

    };


  // ===================================================
  // POLL JENKINS
  // ===================================================

  const startPolling =
    (id) => {

      if (timerRef.current) {

        clearInterval(
          timerRef.current
        );

      }


      const checkStatus =
        async () => {

          try {

            const response =
              await fetch(
                `${API_URL}/deploy/status/${id}`
              );


            const data =
              await response.json();


            if (!response.ok) {

              throw new Error(
                data.detail ||
                "Could not read deployment status."
              );

            }


            setStatus(
              data.status ||
              "queued"
            );


            setBuildNumber(
              data.build_number ||
              null
            );


            setLogs(
              data.logs ||
              ""
            );


            setConsoleUrl(
              data.console_url ||
              ""
            );


            if (
              data.status ===
                "success" ||
              data.status ===
                "failed"
            ) {

              clearInterval(
                timerRef.current
              );

            }

          }

          catch (err) {

            console.error(err);

          }

        };


      checkStatus();


      timerRef.current =
        setInterval(
          checkStatus,
          2000
        );

    };


  // ===================================================
  // COPY LOGS
  // ===================================================

  const copyLogs =
    async () => {

      try {

        await navigator
          .clipboard
          .writeText(logs);

        alert(
          "Jenkins logs copied!"
        );

      }

      catch {

        alert(
          "Could not copy logs."
        );

      }

    };


  // ===================================================
  // STATUS
  // ===================================================

  const getStatusText =
    () => {

      if (
        status === "queued"
      )
        return "QUEUED";

      if (
        status === "building"
      )
        return "BUILDING";

      if (
        status === "success"
      )
        return "SUCCESS";

      if (
        status === "failed"
      )
        return "FAILED";

      return "READY";

    };


  const getStatusClass =
    () => {

      if (
        status === "success"
      )
        return "success";

      if (
        status === "failed"
      )
        return "failed";

      if (
        status === "queued" ||
        status === "building"
      )
        return "running";

      return "ready";

    };


  // ===================================================
  // UI
  // ===================================================

  return (

    <div className="app">


      {/* HEADER */}

      <header className="header">

        <div>

          <h1>

            🚀 Auto
            <span>
              Deploy
            </span>

          </h1>


          <p>

            GitHub → Jenkins → Docker
            → Docker Hub → Ansible

          </p>

        </div>


        <div className="header-status">

          ● System Ready

        </div>

      </header>


      <main className="container">


        {/* ==========================================
            DEPLOYMENT FORM
        ========================================== */}

        <section className="card">

          <div className="title">

            <h2>
              Deploy a GitHub Project
            </h2>

            <p>

              Enter your GitHub repository
              and branch to start an
              automated deployment.

            </p>

          </div>


          <form
            onSubmit={
              startDeployment
            }
          >


            {/* REPOSITORY */}

            <div className="field">

              <label>
                GitHub Repository
              </label>


              <input

                type="url"

                value={repository}

                onChange={
                  (e) =>
                    setRepository(
                      e.target.value
                    )
                }

                placeholder={
                  "https://github.com/username/project.git"
                }

                required

              />

            </div>


            {/* BRANCH */}

            <div className="field">

              <label>
                Branch
              </label>


              <input

                type="text"

                value={branch}

                onChange={
                  (e) =>
                    setBranch(
                      e.target.value
                    )
                }

                placeholder="main"

                required

              />

            </div>


            <button

              className="deploy-button"

              type="submit"

              disabled={
                status === "queued" ||
                status === "building"
              }

            >

              {status === "queued" ||
              status === "building"

                ? "⏳ Deployment Running..."

                : "🚀 Deploy"

              }

            </button>

          </form>


          {/* ERROR */}

          {error && (

            <div className="error">

              ❌ {error}

            </div>

          )}

        </section>


        {/* ==========================================
            PIPELINE
        ========================================== */}

        {deploymentId && (

          <DeploymentPipeline

            logs={logs}

            status={status}

          />

        )}


        {/* ==========================================
            DEPLOYMENT STATUS
        ========================================== */}

        {deploymentId && (

          <section className="card">


            <div className="status-header">


              <div>

                <h2>
                  Deployment Status
                </h2>


                <p className="small">

                  Deployment ID:
                  {" "}
                  {deploymentId}


                  {buildNumber && (

                    <>

                      {" · "}

                      Jenkins Build #
                      {buildNumber}

                    </>

                  )}

                </p>

              </div>


              <div
                className={
                  `status ${
                    getStatusClass()
                  }`
                }
              >

                {getStatusText()}

              </div>

            </div>


            {/* REPOSITORY */}

            <div className="info-grid">


              <div className="info-box">

                <span>
                  Repository
                </span>


                <strong>
                  {repository}
                </strong>

              </div>


              <div className="info-box">

                <span>
                  Branch
                </span>


                <strong>
                  {branch}
                </strong>

              </div>


            </div>


            {/* BUTTONS */}

            <div className="actions">


              {consoleUrl && (

                <a

                  href={consoleUrl}

                  target="_blank"

                  rel="noopener noreferrer"

                  className="console-button"

                >

                  🔎 Open Jenkins Console

                </a>

              )}


              {status ===
                "success" && (

                <a

                  href={
                    DEPLOYED_APP_URL
                  }

                  target="_blank"

                  rel="noopener noreferrer"

                  className="app-button"

                >

                  🌐 Open Deployed Application

                </a>

              )}


            </div>


          </section>

        )}


        {/* ==========================================
            LOGS
        ========================================== */}

        {deploymentId && (

          <section
            className={
              "card logs-card"
            }
          >


            <div
              className={
                "logs-header"
              }
            >

              <div>

                <h2>
                  Jenkins Build Logs
                </h2>

                <p>
                  Live output from Jenkins
                </p>

              </div>


              <button

                className={
                  "copy-button"
                }

                onClick={
                  copyLogs
                }

              >

                Copy Logs

              </button>

            </div>


            <pre

              ref={logRef}

              className="logs"

            >

              {logs ||
                "Waiting for Jenkins..."}

            </pre>


          </section>

        )}


      </main>

    </div>

  );

}


export default App;