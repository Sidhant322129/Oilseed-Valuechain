import os
import sys
import glob
import requests
import json

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATASET_DIR = os.path.join(BASE_DIR, "data", "dataset")
FLASK_URL = "http://localhost:8000/api/detect-pest"

def test_sample():
    # Find the first available image in the dataset
    image_files = glob.glob(os.path.join(DATASET_DIR, "*", "*.jpg")) + \
                  glob.glob(os.path.join(DATASET_DIR, "*", "*.png")) + \
                  glob.glob(os.path.join(DATASET_DIR, "*", "*.jpeg")) + \
                  glob.glob(os.path.join(DATASET_DIR, "*", "*.JPG"))

    if not image_files:
        print("❌ No images found in dataset folder.")
        return

    sample_img = image_files[0]
    expected_class = os.path.basename(os.path.dirname(sample_img))
    print(f"🍃 Testing image: {sample_img}")
    print(f"🏷️ True Category: {expected_class}")

    with open(sample_img, 'rb') as f:
        files = {'image': (os.path.basename(sample_img), f, 'image/jpeg')}
        try:
            resp = requests.post(FLASK_URL, files=files, timeout=10)
            if resp.status_code == 200:
                print("✅ Prediction Result:")
                print(json.dumps(resp.json(), indent=2))
            else:
                print(f"⚠️ Flask error {resp.status_code}: {resp.text}")
        except Exception as e:
            print(f"❌ Connection failed (is Flask server running on port 8000?): {e}")

if __name__ == "__main__":
    test_sample()
