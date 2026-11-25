/**
 * visionService.js
 * Client service connecting CampusFix+ React frontend to the Python FastAPI
 * Computer Vision microservice (Ultralytics YOLO + OpenCV + PyTorch).
 */

import axios from 'axios';

const VISION_BASE_URL = import.meta.env.VITE_VISION_API_URL || 'http://localhost:8000';

const visionClient = axios.create({
  baseURL: VISION_BASE_URL,
  timeout: 30000, // 30 seconds to support cold start inference
});

/**
 * Uploads an image file to the AI microservice for comprehensive damage and quality analysis.
 *
 * @param {File} file - The raw image File object (JPG, PNG, WebP)
 * @returns {Promise<Object>} Analysis results including detections, damage indicators, image quality, and suggested triage
 */
export async function analyzeImage(file) {
  if (!file) {
    throw new Error('Please select an image file to analyze.');
  }

  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await visionClient.post('/api/v1/vision/analyze', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return response.data;
  } catch (err) {
    if (err.code === 'ERR_NETWORK' || !err.response) {
      const error = new Error(
        'CampusFix Vision microservice is offline or unreachable at ' +
          VISION_BASE_URL +
          '. You can continue manual complaint submission.'
      );
      error.isServiceUnavailable = true;
      throw error;
    }

    const serverDetail = err.response?.data?.detail || err.response?.data?.error || err.message;
    const error = new Error(`AI Vision Analysis Failed: ${serverDetail}`);
    error.status = err.response?.status;
    error.detail = serverDetail;
    throw error;
  }
}

/**
 * Checks the operational health and model readiness of the Computer Vision microservice.
 *
 * @returns {Promise<{ isOnline: boolean, data?: Object, error?: string }>}
 */
export async function checkVisionHealth() {
  try {
    const res = await visionClient.get('/health', { timeout: 3000 });
    return {
      isOnline: res.status === 200 && res.data?.status === 'healthy',
      data: res.data,
    };
  } catch (err) {
    return {
      isOnline: false,
      error: err.message,
    };
  }
}

export { VISION_BASE_URL };

