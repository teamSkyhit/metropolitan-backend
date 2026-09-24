import supertest from 'supertest';
import { createApp } from '../../src/app';

export const app = createApp();

/** Supertest agent bound to the shared test app. */
export const api = () => supertest(app);
