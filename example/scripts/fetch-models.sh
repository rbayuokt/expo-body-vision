#!/bin/sh
# Downloads the MediaPipe heavy pose model used by the "custom model file" demo. Not committed (29 MB).
set -e
cd "$(dirname "$0")/../assets/models"
[ -f pose_landmarker_heavy.task ] || curl -sSL -o pose_landmarker_heavy.task \
  https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task
ls -la pose_landmarker_heavy.task
