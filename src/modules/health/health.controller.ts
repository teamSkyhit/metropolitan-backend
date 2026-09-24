import { Request, Response } from 'express';
import { checkDatabaseHealth } from '../../config/database';

export const getHealth = async (_req: Request, res: Response): Promise<void> => {
  const dbStatus = await checkDatabaseHealth();

  res.status(200).json({
    success: true,
    message: 'Metro CRM API is running',
    database: dbStatus,
  });
};
