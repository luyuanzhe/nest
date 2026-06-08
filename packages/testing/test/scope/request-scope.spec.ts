import { Injectable, Scope } from '@nestjs/common';
import { expect } from 'chai';
import { Test } from '../../test';

describe('REQUEST scope in TestingModule', () => {
  @Injectable({ scope: Scope.REQUEST })
  class RequestScopedService {
    public static instanceCount = 0;
    public readonly instanceId: number;

    constructor() {
      RequestScopedService.instanceCount++;
      this.instanceId = RequestScopedService.instanceCount;
    }
  }

  describe('instance generation rules', () => {
    beforeEach(() => {
      RequestScopedService.instanceCount = 0;
    });

    it('should not instantiate a REQUEST-scoped provider during module compilation', async () => {
      const module = await Test.createTestingModule({
        providers: [RequestScopedService],
      }).compile();

      expect(RequestScopedService.instanceCount).to.equal(0);
    });

    it('should throw when using get() on a REQUEST-scoped provider', async () => {
      const module = await Test.createTestingModule({
        providers: [RequestScopedService],
      }).compile();

      expect(() => module.get(RequestScopedService)).to.throw();
    });

    it('should create an instance when using resolve() without contextId', async () => {
      const module = await Test.createTestingModule({
        providers: [RequestScopedService],
      }).compile();

      const instance = await module.resolve(RequestScopedService);

      expect(instance).instanceOf(RequestScopedService);
      expect(RequestScopedService.instanceCount).to.be.greaterThan(0);
    });

    it('should create an instance when using resolve() with explicit contextId', async () => {
      const module = await Test.createTestingModule({
        providers: [RequestScopedService],
      }).compile();

      const contextId = { id: 1 };
      const instance = await module.resolve(RequestScopedService, contextId);

      expect(instance).instanceOf(RequestScopedService);
      expect(RequestScopedService.instanceCount).to.be.greaterThan(0);
    });

    it('should return the same instance for the same contextId', async () => {
      const module = await Test.createTestingModule({
        providers: [RequestScopedService],
      }).compile();

      const contextId = { id: 1 };
      const instance1 = await module.resolve(RequestScopedService, contextId);
      const instance2 = await module.resolve(RequestScopedService, contextId);

      expect(instance1).to.equal(instance2);
    });

    it('should return different instances for different contextIds', async () => {
      const module = await Test.createTestingModule({
        providers: [RequestScopedService],
      }).compile();

      const contextId1 = { id: 1 };
      const contextId2 = { id: 2 };
      const instance1 = await module.resolve(RequestScopedService, contextId1);
      const instance2 = await module.resolve(RequestScopedService, contextId2);

      expect(instance1).to.not.equal(instance2);
    });

    it('should create a new instance when resolve() is called without contextId each time', async () => {
      const module = await Test.createTestingModule({
        providers: [RequestScopedService],
      }).compile();

      const instance1 = await module.resolve(RequestScopedService);
      const instance2 = await module.resolve(RequestScopedService);

      expect(instance1).to.not.equal(instance2);
    });
  });

  describe('instance isolation', () => {
    const COUNTER_TOKEN = Symbol('COUNTER_TOKEN');

    @Injectable({ scope: Scope.REQUEST })
    class RequestScopedCounter {
      public count = 0;

      increment() {
        this.count++;
      }
    }

    beforeEach(() => {
      RequestScopedCounter.prototype.count = 0;
    });

    it('should isolate state between different request contexts', async () => {
      const module = await Test.createTestingModule({
        providers: [
          RequestScopedCounter,
          { provide: COUNTER_TOKEN, useExisting: RequestScopedCounter },
        ],
      }).compile();

      const contextId1 = { id: 1 };
      const contextId2 = { id: 2 };

      const counter1 = await module.resolve(
        RequestScopedCounter,
        contextId1,
      );
      const counter2 = await module.resolve(
        RequestScopedCounter,
        contextId2,
      );

      counter1.increment();
      counter1.increment();

      counter2.increment();

      expect(counter1.count).to.equal(2);
      expect(counter2.count).to.equal(1);
    });

    it('should share the same instance within the same request context when resolved by class', async () => {
      const module = await Test.createTestingModule({
        providers: [
          RequestScopedCounter,
          { provide: COUNTER_TOKEN, useExisting: RequestScopedCounter },
        ],
      }).compile();

      const contextId = { id: 1 };

      const counter1 = await module.resolve(RequestScopedCounter, contextId);
      counter1.increment();

      const counter2 = await module.resolve(RequestScopedCounter, contextId);

      expect(counter2.count).to.equal(1);
    });

    it('should create independent instances for each call to resolve() without contextId', async () => {
      const module = await Test.createTestingModule({
        providers: [RequestScopedCounter],
      }).compile();

      const counter1 = await module.resolve(RequestScopedCounter);
      counter1.increment();
      counter1.increment();

      const counter2 = await module.resolve(RequestScopedCounter);
      counter2.increment();

      expect(counter1.count).to.equal(2);
      expect(counter2.count).to.equal(1);
    });
  });
});