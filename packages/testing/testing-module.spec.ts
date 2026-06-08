import { Injectable, Scope } from '@nestjs/common';
import { ContextIdFactory } from '@nestjs/core';
import { expect } from 'chai';
import { Test } from './test';

describe('TestingModule - Scoped Providers', () => {
  describe('TRANSIENT scope', () => {
    @Injectable({ scope: Scope.TRANSIENT })
    class TransientService {
      public static instanceCount = 0;
      public readonly instanceId: number;

      constructor() {
        TransientService.instanceCount++;
        this.instanceId = TransientService.instanceCount;
      }
    }

    @Injectable()
    class RegularService {
      constructor(public readonly transient: TransientService) {}
    }

    beforeEach(() => {
      TransientService.instanceCount = 0;
    });

    it('should create new instance every time resolve is called', async () => {
      const module = await Test.createTestingModule({
        providers: [TransientService, RegularService],
      }).compile();

      const instance1 = await module.resolve(TransientService);
      const instance2 = await module.resolve(TransientService);

      expect(instance1).to.be.instanceOf(TransientService);
      expect(instance2).to.be.instanceOf(TransientService);
      expect(instance1).to.not.equal(instance2);
      expect(TransientService.instanceCount).to.equal(2);
    });

    it('should create new instance even with same contextId', async () => {
      const module = await Test.createTestingModule({
        providers: [TransientService],
      }).compile();

      const contextId = ContextIdFactory.create();
      const instance1 = await module.resolve(TransientService, contextId);
      const instance2 = await module.resolve(TransientService, contextId);

      expect(instance1).to.not.equal(instance2);
      expect(instance1.instanceId).to.not.equal(instance2.instanceId);
    });

    it('should create new transient instance for each regular service', async () => {
      const module = await Test.createTestingModule({
        providers: [TransientService, RegularService],
      }).compile();

      const regular1 = await module.resolve(RegularService);
      const regular2 = await module.resolve(RegularService);

      expect(regular1.transient.instanceId).to.not.equal(
        regular2.transient.instanceId,
      );
    });
  });

  describe('REQUEST scope', () => {
    @Injectable({ scope: Scope.REQUEST })
    class RequestService {
      public static instanceCount = 0;
      public readonly instanceId: number;

      constructor() {
        RequestService.instanceCount++;
        this.instanceId = RequestService.instanceCount;
      }
    }

    @Injectable()
    class RegularService {
      constructor(public readonly request: RequestService) {}
    }

    beforeEach(() => {
      RequestService.instanceCount = 0;
    });

    it('should create new instance for different contextIds', async () => {
      const module = await Test.createTestingModule({
        providers: [RequestService],
      }).compile();

      const contextId1 = ContextIdFactory.create();
      const contextId2 = ContextIdFactory.create();

      const instance1 = await module.resolve(RequestService, contextId1);
      const instance2 = await module.resolve(RequestService, contextId2);

      expect(instance1).to.be.instanceOf(RequestService);
      expect(instance2).to.be.instanceOf(RequestService);
      expect(instance1).to.not.equal(instance2);
      expect(RequestService.instanceCount).to.equal(2);
    });

    it('should return same instance for same contextId', async () => {
      const module = await Test.createTestingModule({
        providers: [RequestService],
      }).compile();

      const contextId = ContextIdFactory.create();
      const instance1 = await module.resolve(RequestService, contextId);
      const instance2 = await module.resolve(RequestService, contextId);

      expect(instance1).to.equal(instance2);
      expect(instance1.instanceId).to.equal(instance2.instanceId);
    });

    it('should bubble request scope to regular service', async () => {
      const module = await Test.createTestingModule({
        providers: [RequestService, RegularService],
      }).compile();

      const contextId1 = ContextIdFactory.create();
      const contextId2 = ContextIdFactory.create();

      const regular1 = await module.resolve(RegularService, contextId1);
      const regular2 = await module.resolve(RegularService, contextId2);

      expect(regular1).to.not.equal(regular2);
      expect(regular1.request.instanceId).to.not.equal(
        regular2.request.instanceId,
      );
    });
  });

  describe('Combined scopes', () => {
    @Injectable({ scope: Scope.TRANSIENT })
    class TransientDependency {
      public static instanceCount = 0;
      public readonly instanceId: number;

      constructor() {
        TransientDependency.instanceCount++;
        this.instanceId = TransientDependency.instanceCount;
      }
    }

    @Injectable({ scope: Scope.REQUEST })
    class RequestScopedService {
      public static instanceCount = 0;
      public readonly instanceId: number;

      constructor(public readonly transient: TransientDependency) {
        RequestScopedService.instanceCount++;
        this.instanceId = RequestScopedService.instanceCount;
      }
    }

    beforeEach(() => {
      TransientDependency.instanceCount = 0;
      RequestScopedService.instanceCount = 0;
    });

    it('should create isolated instances for different request contexts', async () => {
      const module = await Test.createTestingModule({
        providers: [TransientDependency, RequestScopedService],
      }).compile();

      const contextId1 = ContextIdFactory.create();
      const contextId2 = ContextIdFactory.create();

      const service1 = await module.resolve(RequestScopedService, contextId1);
      const service2 = await module.resolve(RequestScopedService, contextId2);

      expect(service1.instanceId).to.not.equal(service2.instanceId);
      expect(service1.transient.instanceId).to.not.equal(
        service2.transient.instanceId,
      );
      expect(RequestScopedService.instanceCount).to.equal(2);
      expect(TransientDependency.instanceCount).to.equal(2);
    });

    it('should create new transient for each request service instance', async () => {
      const module = await Test.createTestingModule({
        providers: [TransientDependency, RequestScopedService],
      }).compile();

      const contextId = ContextIdFactory.create();
      const service1 = await module.resolve(RequestScopedService, contextId);
      const service2 = await module.resolve(RequestScopedService, contextId);

      expect(service1).to.equal(service2);
      expect(service1.transient.instanceId).to.equal(
        service2.transient.instanceId,
      );
    });
  });

  describe('Instance isolation validation', () => {
    @Injectable({ scope: Scope.REQUEST })
    class RequestCounter {
      private counter = 0;

      increment() {
        this.counter++;
        return this.counter;
      }
    }

    @Injectable({ scope: Scope.TRANSIENT })
    class TransientCounter {
      private counter = 0;

      increment() {
        this.counter++;
        return this.counter;
      }
    }

    it('should isolate state between request-scoped instances', async () => {
      const module = await Test.createTestingModule({
        providers: [RequestCounter],
      }).compile();

      const contextId1 = ContextIdFactory.create();
      const contextId2 = ContextIdFactory.create();

      const counter1 = await module.resolve(RequestCounter, contextId1);
      const counter2 = await module.resolve(RequestCounter, contextId2);

      expect(counter1.increment()).to.equal(1);
      expect(counter1.increment()).to.equal(2);
      expect(counter2.increment()).to.equal(1);
    });

    it('should isolate state between transient-scoped instances', async () => {
      const module = await Test.createTestingModule({
        providers: [TransientCounter],
      }).compile();

      const counter1 = await module.resolve(TransientCounter);
      const counter2 = await module.resolve(TransientCounter);

      expect(counter1.increment()).to.equal(1);
      expect(counter1.increment()).to.equal(2);
      expect(counter2.increment()).to.equal(1);
    });
  });
});
