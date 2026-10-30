# This directory stores the trained scikit-learn pricing model PKL file.
#
# To generate price_predictor.pkl, run from the ai_service/ directory:
#   python pricing_model.py --train
#
# The Dockerfile runs this automatically during the build step.
# For local development without Docker:
#   pip install -r requirements.txt
#   python pricing_model.py --train
