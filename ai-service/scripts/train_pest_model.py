import os
import sys
import json
import logging
from pathlib import Path
import numpy as np
import tensorflow as tf
from tensorflow.keras import layers, models
from tensorflow.keras.preprocessing.image import ImageDataGenerator

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("train_pest_model")

# Directories
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATASET_DIR = os.path.join(BASE_DIR, "data", "dataset")
WEIGHTS_DIR = os.path.join(BASE_DIR, "weights")
os.makedirs(WEIGHTS_DIR, exist_ok=True)
sys.path.insert(0, BASE_DIR)

from utils.supabase_client import upload_model_to_bucket

IMG_HEIGHT, IMG_WIDTH = 128, 128
BATCH_SIZE = 16
EPOCHS = 15

def train():
    logger.info(f"📂 Scanning dataset in {DATASET_DIR}...")
    if not os.path.exists(DATASET_DIR):
        logger.error(f"Dataset directory not found: {DATASET_DIR}")
        sys.exit(1)

    # 1. Data augmentation & preprocessing
    datagen = ImageDataGenerator(
        rescale=1.0 / 255.0,
        rotation_range=20,
        width_shift_range=0.1,
        height_shift_range=0.1,
        shear_range=0.1,
        zoom_range=0.2,
        horizontal_flip=True,
        fill_mode='nearest',
        validation_split=0.2
    )

    train_generator = datagen.flow_from_directory(
        DATASET_DIR,
        target_size=(IMG_HEIGHT, IMG_WIDTH),
        batch_size=BATCH_SIZE,
        class_mode='categorical',
        subset='training',
        shuffle=True
    )

    val_generator = datagen.flow_from_directory(
        DATASET_DIR,
        target_size=(IMG_HEIGHT, IMG_WIDTH),
        batch_size=BATCH_SIZE,
        class_mode='categorical',
        subset='validation',
        shuffle=False
    )

    num_classes = train_generator.num_classes
    class_indices = {v: k for k, v in train_generator.class_indices.items()}
    logger.info(f"🌿 Detected {num_classes} disease classes: {class_indices}")

    # 2. Build 3 Conv2D + MaxPooling CNN Architecture
    model = models.Sequential([
        # Block 1
        layers.Conv2D(32, (3, 3), activation='relu', padding='same', input_shape=(IMG_HEIGHT, IMG_WIDTH, 3)),
        layers.BatchNormalization(),
        layers.MaxPooling2D((2, 2)),

        # Block 2
        layers.Conv2D(64, (3, 3), activation='relu', padding='same'),
        layers.BatchNormalization(),
        layers.MaxPooling2D((2, 2)),

        # Block 3
        layers.Conv2D(128, (3, 3), activation='relu', padding='same'),
        layers.BatchNormalization(),
        layers.MaxPooling2D((2, 2)),

        # Classifier Head
        layers.Flatten(),
        layers.Dense(128, activation='relu'),
        layers.Dropout(0.4),
        layers.Dense(num_classes, activation='softmax')
    ])

    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=0.001),
        loss='categorical_crossentropy',
        metrics=['accuracy']
    )

    model.summary()

    # 3. Train
    logger.info(f"🚀 Training for {EPOCHS} epochs...")
    history = model.fit(
        train_generator,
        validation_data=val_generator,
        epochs=EPOCHS,
        verbose=1
    )

    # 4. Save Model & Metadata
    model_path = os.path.join(WEIGHTS_DIR, "pest_classifier.h5")
    classes_path = os.path.join(WEIGHTS_DIR, "pest_classes.json")

    model.save(model_path, include_optimizer=False)
    with open(classes_path, "w") as f:
        json.dump(class_indices, f, indent=2)

    artifacts = [
        (Path(model_path), "pest_classifier/pest_classifier.h5"),
        (Path(classes_path), "pest_classifier/pest_classes.json"),
    ]
    failed_uploads = [
        remote_path
        for local_path, remote_path in artifacts
        if not upload_model_to_bucket(local_path, remote_path)
    ]
    if failed_uploads:
        raise RuntimeError(f"Failed to upload pest model artifacts: {', '.join(failed_uploads)}")

    val_acc = history.history.get('val_accuracy', [-1])[-1]
    logger.info(f"✅ Training completed! Validation Accuracy: {val_acc * 100:.2f}%")
    logger.info(f"💾 Model saved to: {model_path}")
    logger.info(f"🏷️ Class labels saved to: {classes_path}")
    logger.info("☁️ Model and class labels uploaded to Supabase Storage bucket 'ml-models'.")

if __name__ == "__main__":
    train()
