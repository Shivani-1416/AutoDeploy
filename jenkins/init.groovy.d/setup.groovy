import jenkins.model.Jenkins
import hudson.security.HudsonPrivateSecurityRealm
import hudson.security.FullControlOnceLoggedInAuthorizationStrategy
import hudson.model.FreeStyleProject
import hudson.model.StringParameterDefinition
import hudson.model.ParametersDefinitionProperty
import hudson.tasks.Shell
import hudson.model.BuildAuthorizationToken
println "=========================================="
println " AutoDeploy Automatic Jenkins Setup"
println "=========================================="

// --------------------------------------------------
// Jenkins instance
// --------------------------------------------------

def jenkins = Jenkins.get()

// --------------------------------------------------
// Admin credentials
// --------------------------------------------------

def adminUsername = System.getenv("JENKINS_ADMIN_USER") ?: "jenkins-admin"
def adminPassword = System.getenv("JENKINS_ADMIN_PASSWORD") ?: "autodeploy123"

// --------------------------------------------------
// Create security realm
// --------------------------------------------------

def securityRealm = jenkins.getSecurityRealm()

if (!(securityRealm instanceof HudsonPrivateSecurityRealm)) {

    println "Creating Jenkins security realm..."

    securityRealm = new HudsonPrivateSecurityRealm(false)

    jenkins.setSecurityRealm(securityRealm)
}

// --------------------------------------------------
// Create admin user
// --------------------------------------------------

def user = jenkins.getUser(adminUsername)

if (user == null) {

    println "Creating admin user: ${adminUsername}"

    def newUser = securityRealm.createAccount(
        adminUsername,
        adminPassword
    )

    newUser.setFullName("AutoDeploy Administrator")
    newUser.save()

} else {

    println "Admin user already exists: ${adminUsername}"
}

// --------------------------------------------------
// Authorization
// --------------------------------------------------

def authorizationStrategy =
    new FullControlOnceLoggedInAuthorizationStrategy()

authorizationStrategy.setAllowAnonymousRead(true)

jenkins.setAuthorizationStrategy(authorizationStrategy)

// --------------------------------------------------
// Create AutoDeploy job
// --------------------------------------------------

def jobName = "AutoDeploy-project-job"

def existingJob = jenkins.getItem(jobName)

if (existingJob == null) {

    println "Creating Jenkins job: ${jobName}"

    def project = jenkins.createProject(
        FreeStyleProject.class,
        jobName
    )
    def triggerToken = "autodeploy-trigger"

    def authTokenField =
        hudson.model.AbstractProject.class.getDeclaredField("authToken")

    authTokenField.setAccessible(true)

    authTokenField.set(
        project,
        new BuildAuthorizationToken(triggerToken)
    )

    println "Configured remote build trigger token."
    def repositoryParameter =
        new StringParameterDefinition(
            "REPOSITORY",
            "",
            "GitHub repository URL"
        )

    // ----------------------------------------------
    // Branch parameter
    // ----------------------------------------------

    def branchParameter =
        new StringParameterDefinition(
            "BRANCH",
            "main",
            "GitHub branch"
        )

    project.addProperty(
        new ParametersDefinitionProperty(
            repositoryParameter,
            branchParameter
        )
    )

    // ----------------------------------------------
    // Build script
    // ----------------------------------------------

    def buildScript = '''
#!/bin/bash

set -e

echo "=========================================="
echo " AutoDeploy Pipeline"
echo "=========================================="

echo "Repository: $REPOSITORY"
echo "Branch:     $BRANCH"

# ----------------------------------------------
# STEP 1 - GitHub Pull
# ----------------------------------------------

echo ""
echo "=========================================="
echo "STEP 1: GitHub Pull"
echo "=========================================="

rm -rf app

git clone \
    --branch "$BRANCH" \
    --single-branch \
    "$REPOSITORY" \
    app

echo "Repository cloned successfully"

# ----------------------------------------------
# STEP 2 - Docker Build
# ----------------------------------------------

echo ""
echo "=========================================="
echo "STEP 2: Docker Build"
echo "=========================================="

if [ ! -f app/Dockerfile ]; then
    echo "ERROR: Dockerfile not found!"
    exit 1
fi

docker build \
    -t autodeploy-demo-app:latest \
    app

echo "Docker image built successfully"

# ----------------------------------------------
# Detect application port
# ----------------------------------------------

echo ""
echo "=========================================="
echo "Detecting application port"
echo "=========================================="

CONTAINER_PORT=$(docker image inspect \
    autodeploy-demo-app:latest \
    --format '{{range $p, $_ := .Config.ExposedPorts}}{{$p}} {{end}}' \
    | awk '{print $1}' \
    | cut -d/ -f1)

if [ -z "$CONTAINER_PORT" ]; then

    echo "No EXPOSE port detected."
    echo "Using default port 80."

    CONTAINER_PORT=80

fi

echo "Application port: $CONTAINER_PORT"

# ----------------------------------------------
# STEP 3 - Optional Docker Hub Push
# ----------------------------------------------

echo ""
echo "=========================================="
echo "STEP 3: Docker Hub Push"
echo "=========================================="

if [ -n "$DOCKER_USERNAME" ] && [ -n "$DOCKER_PASSWORD" ]; then

    echo "Docker Hub credentials detected."

    echo "$DOCKER_PASSWORD" | docker login \
        -u "$DOCKER_USERNAME" \
        --password-stdin

    docker tag \
        autodeploy-demo-app:latest \
        "$DOCKER_USERNAME/autodeploy-demo-app:latest"

    docker push \
        "$DOCKER_USERNAME/autodeploy-demo-app:latest"

    echo "Docker image pushed successfully"

else

    echo "Docker Hub credentials not configured."
    echo "Skipping Docker Hub push."

fi

# ----------------------------------------------
# STEP 4 - Ansible Deployment
# ----------------------------------------------

echo ""
echo "=========================================="
echo "STEP 4: Ansible Deployment"
echo "=========================================="

ansible-playbook \
    /etc/ansible/playbooks/deploy_app.yml \
    -e "container_port=$CONTAINER_PORT"

echo "Ansible deployment completed"

# ----------------------------------------------
# STEP 5 - Application Live
# ----------------------------------------------

echo ""
echo "=========================================="
echo "STEP 5: Application Live"
echo "=========================================="

echo "Application is available at:"
echo "http://localhost:8081"

echo ""
echo "=========================================="
echo " AutoDeploy Deployment Complete"
echo "=========================================="
'''

    project.getBuildersList().add(
        new Shell(buildScript)
    )

    project.save()

    println "Job created successfully!"

} else {

    println "Job already exists: ${jobName}"

}

jenkins.save()

println "=========================================="
println " AutoDeploy Setup Complete"
println "=========================================="