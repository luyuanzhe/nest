import { Injectable, Scope } from '@nestjs/common';
import { ContextIdFactory } from '@nestjs/core';
import { Test, TestingModule } from '../';
import { expect } from 'chai';

describe('TestingModule Scopes', () => {
  @Injectable({ scope: Scope.REQUEST })
  class RequestScopedService {
    public readonly id = Math.random();
  }

  @Injectable({ scope: Scope.TRANSIENT })
  class TransientScopedService {
    public readonly id = Math.random();
  }

  let testingModule: TestingModule;

  beforeEach(async () => {
    testingModule = await Test.createTestingModule({
      providers: [RequestScopedService, TransientScopedService],
    }).compile();
  });

  describe('REQUEST scope', () => {
    it('should generate a new instance for different contextIds', async () => {
      const contextId1 = ContextIdFactory.create();
      const contextId2 = ContextIdFactory.create();

      const instance1 = await testingModule.resolve(RequestScopedService, contextId1);
      const instance2 = await testingModule.resolve(RequestScopedService, contextId2);

      expect(instance1).to.not.equal(instance2);
      expect(instance1.id).to.not.equal(instance2.id);
    });

    it('should return the same instance for the same contextId', async () => {
      const contextId = ContextIdFactory.create();

      const instance1 = await testingModule.resolve(RequestScopedService, contextId);
      const instance2 = await testingModule.resolve(RequestScopedService, contextId);

      expect(instance1).to.equal(instance2);
      expect(instance1.id).to.equal(instance2.id);
    });

    it('should generate a new instance when resolved without contextId (fallback to new contextId per call)', async () => {
      const instance1 = await testingModule.resolve(RequestScopedService);
      const instance2 = await testingModule.resolve(RequestScopedService);

      expect(instance1).to.not.equal(instance2);
      expect(instance1.id).to.not.equal(instance2.id);
    });

    it('should throw an error when trying to get an instance using get()', () => {
      expect(() => testingModule.get(RequestScopedService)).to.throw();
    });
  });

  describe('TRANSIENT scope', () => {
    it('should generate a new instance every time it is resolved', async () => {
      const instance1 = await testingModule.resolve(TransientScopedService);
      const instance2 = await testingModule.resolve(TransientScopedService);

      expect(instance1).to.not.equal(instance2);
      expect(instance1.id).to.not.equal(instance2.id);
    });

    it('should generate a new instance even with the same contextId', async () => {
      const contextId = ContextIdFactory.create();

      const instance1 = await testingModule.resolve(TransientScopedService, contextId);
      const instance2 = await testingModule.resolve(TransientScopedService, contextId);

      expect(instance1).to.not.equal(instance2);
      expect(instance1.id).to.not.equal(instance2.id);
    });

    it('should throw an error when trying to get an instance using get()', () => {
      expect(() => testingModule.get(TransientScopedService)).to.throw();
    });
  });
});
