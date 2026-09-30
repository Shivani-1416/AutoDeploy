FROM jenkins/jenkins:lts-jdk21

USER root

# ==========================================
# Install required packages
# ==========================================

RUN apt-get update && \
    apt-get install -y \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    python3 \
    python3-pip \
    git \
    gosu && \
    install -m 0755 -d /etc/apt/keyrings && \
    curl -fsSL https://download.docker.com/linux/debian/gpg \
    -o /etc/apt/keyrings/docker.asc && \
    chmod a+r /etc/apt/keyrings/docker.asc && \
    echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list && \
    apt-get update && \
    apt-get install -y docker-ce-cli && \
    rm -rf /var/lib/apt/lists/*

# ==========================================
# Install Ansible
# ==========================================

RUN pip3 install --break-system-packages ansible requests

# ==========================================
# Install Docker Ansible collection
# ==========================================

RUN ansible-galaxy collection install community.docker

# ==========================================
# Jenkins plugins
# ==========================================

COPY plugins.txt /usr/share/jenkins/ref/plugins.txt

RUN jenkins-plugin-cli \
    --plugin-file /usr/share/jenkins/ref/plugins.txt

# ==========================================
# Automatic Jenkins configuration
# ==========================================

COPY init.groovy.d/setup.groovy \
    /usr/share/jenkins/ref/init.groovy.d/setup.groovy

# ==========================================
# Docker socket entrypoint
# ==========================================

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# Convert Windows CRLF line endings to Linux LF
# and make the script executable
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh && \
    chmod +x /usr/local/bin/docker-entrypoint.sh

# ==========================================
# Skip Jenkins setup wizard
# ==========================================

ENV JAVA_OPTS="-Djenkins.install.runSetupWizard=false"

# ==========================================
# Start Jenkins through entrypoint
# ==========================================

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

USER root