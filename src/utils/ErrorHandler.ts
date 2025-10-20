// src/utils/ErrorHandler.ts

import { logger } from './Logger';

export class AppError extends Error {
  constructor(
    public code: string,
    public statusCode: number,
    message: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const handleError = async (
  error: any,
  service: string,
  fallbackMessage: string
): Promise<void> => {
  logger.error(`[${service}] ${fallbackMessage}`, error);
  
  if (error instanceof AppError) {
    logger.error(`[${error.code}] ${error.message}`);
  } else if (error.response?.status) {
    logger.error(`HTTP ${error.response.status}: ${error.response.data?.message || error.message}`);
  } else {
    logger.error(error.message || fallbackMessage);
  }
};