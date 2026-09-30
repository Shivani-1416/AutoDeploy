#!/bin/bash

set -e

echo "=========================================="
echo " Configuring Docker socket permissions"
echo "=========================================="

if [ -S /var/run/docker.sock ]; then

    DOCKER_GID=$(stat -c '%g' /var/run/docker.sock)

    echo "Docker socket GID: $DOCKER_GID"

    if getent group "$DOCKER_GID" > /dev/null 2>&1; then

        DOCKER_GROUP=$(getent group "$DOCKER_GID" | cut -d: -f1)

        echo "Using existing Docker group: $DOCKER_GROUP"

    else

        groupadd -g "$DOCKER_GID" docker-host

        DOCKER_GROUP=docker-host

        echo "Created Docker group: $DOCKER_GROUP"

    fi

    usermod -aG "$DOCKER_GROUP" jenkins

    echo "Added jenkins user to Docker group."

else

    echo "WARNING: /var/run/docker.sock not found."

fi

echo "=========================================="
echo " Starting Jenkins"
echo "=========================================="

exec gosu jenkins /usr/local/bin/jenkins.sh "$@"