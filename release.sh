RELEASE="2025-08-26v1"
git tag "${RELEASE}"

for SERVICE in web gateway workers websockets migrations; do
  docker tag "latitude-dev/${SERVICE}:latest" "us-central1-docker.pkg.dev/trailhead-ai/trailhead/latitude-dev/${SERVICE}:${RELEASE}"
  docker push "us-central1-docker.pkg.dev/trailhead-ai/trailhead/latitude-dev/${SERVICE}:${RELEASE}"
done

