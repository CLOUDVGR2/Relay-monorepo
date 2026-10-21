/** Tests for app controller spec in the nest api. */

import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

/**
 * Unit tests for AppController.
 *
 * These tests verify that the controller behaves as expected
 * without starting a real HTTP server.
 */
describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    // Create a testing module that provides the controller
    // and its required service dependency.
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    // Retrieve the controller instance from the testing module.
    appController = app.get<AppController>(AppController);
  });

  // Group tests related to the root endpoint.
  describe('root', () => {
    it('should return "Hello World!"', () => {
      // Verify that the controller returns the expected greeting.
      expect(appController.getHello()).toBe('Hello World!');
    });
  });
});