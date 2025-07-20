// src/express.d.ts
// This file extends the Express Request type to include the 'rawBody' property.

// Import the Request type from the 'express' module.
import { Request } from 'express';

// Declare a module augmentation for 'express'.
// This allows you to add properties to existing Express interfaces.
declare module 'express' {
  // Extend the Request interface.
  interface Request {
    // Add the 'rawBody' property, which will be a Buffer (Node.js Buffer type).
    // It can also be undefined if the body is empty or not processed.
    rawBody?: Buffer;
  }
}