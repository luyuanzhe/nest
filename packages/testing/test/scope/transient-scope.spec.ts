import { Injectable, Scope } from '@nestjs/common';
import { expect } from 'chai';
import { Test } from '../../test';

describe('TRANSIENT scope in TestingModule', () => {
  @Injectable({ scope: Scope.TRANSIENT })
  class TransientService {
    public static instanceCount = 0;
    public readonly instanceId: number;

    constructor() {
      TransientService.instanceCount++;
      this.instanceId = TransientService.instanceCount;
    }
  }

  describe('instance generation rules', () => {
    beforeEach(() => {
      TransientService.instanceCount = 0;
    });

    it('should not instantiate a TRANSIENT-scoped provider during module compilation', async () => {
      const module = await Test.createTestingModule({
        providers: [TransientService],
      }).compile();

      expect(TransientService.instanceCount).to.equal(0);
    });

    it('should throw when using get() on a TRANSIENT-scoped provider', async () => {
      const module = await Test.createTestingModule({
        providers: [TransientService],
      }).compile();

      expect(() => module.get(TransientService)).to.throw();
    });

    it('should create an instance when using resolve() without contextId', async () => {
      const module = await Test.createTestingModule({
        providers: [TransientService],
      }).compile();

      const instance = await module.resolve(TransientService);

      expect(instance).instanceOf(TransientService);
      expect(TransientService.instanceCount).to.be.greaterThan(0);
    });

    it('should create an instance when using resolve() with explicit contextId', async () => {
      const module = await Test.createTestingModule({
        providers: [TransientService],
      }).compile();

      const contextId = { id: 1 };
      const instance = await module.resolve(TransientService, contextId);

      expect(instance).instanceOf(TransientService);
      expect(TransientService.instanceCount).to.be.greaterThan(0);
    });

    it('should return the same instance for the same contextId', async () => {
      const module = await Test.createTestingModule({
        providers: [TransientService],
      }).compile();

      const contextId = { id: 1 };
      const instance1 = await module.resolve(TransientService, contextId);
      const instance2 = await module.resolve(TransientService, contextId);

      expect(instance1).to.equal(instance2);
    });

    it('should return different instances for different contextIds', async () => {
      const module = await Test.createTestingModule({
        providers: [TransientService],
      }).compile();

      const contextId1 = { id: 1 };
      const contextId2 = { id: 2 };
      const instance1 = await module.resolve(TransientService, contextId1);
      const instance2 = await module.resolve(TransientService, contextId2);

      expect(instance1).to.not.equal(instance2);
    });

    it('should create a new instance when resolve() is called without contextId each time', async () => {
      const module = await Test.createTestingModule({
        providers: [TransientService],
      }).compile();

      const instance1 = await module.resolve(TransientService);
      const instance2 = await module.resolve(TransientService);

      expect(instance1).to.not.equal(instance2);
    });
  });

  describe('instance isolation via dependency injection', () => {
    @Injectable({ scope: Scope.TRANSIENT })
    class CounterService {
      public count = 0;

      increment() {
        this.count++;
      }
    }

    @Injectable()
    class ConsumerA {
      constructor(public readonly counter: CounterService) {}
    }

    @Injectable()
    class ConsumerB {
      constructor(public readonly counter: CounterService) {}
    }

    @Injectable()
    class AggregateConsumer {
      constructor(
        public readonly consumerA: ConsumerA,
        public readonly consumerB: ConsumerB,
      ) {}
    }

    beforeEach(() => {
      CounterService.prototype.count = 0;
    });

    it('should create separate TRANSIENT instances for each injection point', async () => {
      const module = await Test.createTestingModule({
        providers: [ConsumerA, ConsumerB, CounterService, AggregateConsumer],
      }).compile();

      const contextId = { id: 1 };
      const aggregate = await module.resolve(AggregateConsumer, contextId);

      aggregate.consumerA.counter.increment();
      aggregate.consumerA.counter.increment();

      aggregate.consumerB.counter.increment();

      expect(aggregate.consumerA.counter.count).to.equal(2);
      expect(aggregate.consumerB.counter.count).to.equal(1);
    });

    it('should create separate TRANSIENT instances across different parent consumers', async () => {
      const module = await Test.createTestingModule({
        providers: [ConsumerA, ConsumerB, CounterService],
      }).compile();

      const contextId = { id: 1 };
      const consumerA = await module.resolve(ConsumerA, contextId);
      const consumerB = await module.resolve(ConsumerB, contextId);

      consumerA.counter.increment();

      expect(consumerA.counter.count).to.equal(1);
      expect(consumerB.counter.count).to.equal(0);
    });

    it('should create separate TRANSIENT instances when consuming via resolve() directly from module', async () => {
      const module = await Test.createTestingModule({
        providers: [ConsumerA, CounterService],
      }).compile();

      const contextId = { id: 1 };
      const consumerA1 = await module.resolve(ConsumerA, contextId);
      const consumerA2 = await module.resolve(ConsumerA, contextId);

      consumerA1.counter.increment();

      expect(consumerA1.counter.count).to.equal(1);
      expect(consumerA2.counter.count).to.equal(0);
    });
  });

  describe('nested TRANSIENT dependency chains', () => {
    @Injectable({ scope: Scope.TRANSIENT })
    class InnerTransient {
      public static instanceCount = 0;
      public readonly instanceId: number;

      constructor() {
        InnerTransient.instanceCount++;
        this.instanceId = InnerTransient.instanceCount;
      }
    }

    @Injectable({ scope: Scope.TRANSIENT })
    class OuterTransient {
      public static instanceCount = 0;
      public readonly instanceId: number;

      constructor(public readonly inner: InnerTransient) {
        OuterTransient.instanceCount++;
        this.instanceId = OuterTransient.instanceCount;
      }
    }

    @Injectable()
    class ParentConsumer {
      constructor(public readonly outer: OuterTransient) {}
    }

    beforeEach(() => {
      InnerTransient.instanceCount = 0;
      OuterTransient.instanceCount = 0;
    });

    it('should create unique inner TRANSIENT instances for each outer TRANSIENT', async () => {
      const module = await Test.createTestingModule({
        providers: [InnerTransient, OuterTransient, ParentConsumer],
      }).compile();

      const contextId = { id: 1 };
      const parent1 = await module.resolve(ParentConsumer, contextId);
      const parent2 = await module.resolve(ParentConsumer, contextId);

      expect(parent1.outer.inner.instanceId).to.not.equal(
        parent2.outer.inner.instanceId,
      );
    });

    it('should create unique outer TRANSIENT instances for each parent', async () => {
      const module = await Test.createTestingModule({
        providers: [InnerTransient, OuterTransient, ParentConsumer],
      }).compile();

      const contextId = { id: 1 };
      const parent1 = await module.resolve(ParentConsumer, contextId);
      const parent2 = await module.resolve(ParentConsumer, contextId);

      expect(parent1.outer.instanceId).to.not.equal(
        parent2.outer.instanceId,
      );
    });

    it('should create unique instances at every level of the TRANSIENT chain per context', async () => {
      const module = await Test.createTestingModule({
        providers: [InnerTransient, OuterTransient, ParentConsumer],
      }).compile();

      const contextId1 = { id: 1 };
      const contextId2 = { id: 2 };

      const parentInCtx1 = await module.resolve(ParentConsumer, contextId1);
      const parentInCtx2 = await module.resolve(ParentConsumer, contextId2);

      expect(parentInCtx1.outer.inner.instanceId).to.not.equal(
        parentInCtx2.outer.inner.instanceId,
      );
    });
  });

  describe('standalone TRANSIENT provider resolve behavior', () => {
    @Injectable({ scope: Scope.TRANSIENT })
    class StandaloneTransient {
      public value = 'initial';
    }

    it('should cache the transient instance per contextId when resolved standalone', async () => {
      const module = await Test.createTestingModule({
        providers: [StandaloneTransient],
      }).compile();

      const contextId = { id: 1 };

      const instance1 = await module.resolve(StandaloneTransient, contextId);
      instance1.value = 'modified';

      const instance2 = await module.resolve(StandaloneTransient, contextId);

      expect(instance1).to.equal(instance2);
      expect(instance2.value).to.equal('modified');
    });

    it('should not share instances across different contextIds', async () => {
      const module = await Test.createTestingModule({
        providers: [StandaloneTransient],
      }).compile();

      const contextId1 = { id: 1 };
      const contextId2 = { id: 2 };

      const instance1 = await module.resolve(StandaloneTransient, contextId1);
      instance1.value = 'ctx1';

      const instance2 = await module.resolve(StandaloneTransient, contextId2);
      instance2.value = 'ctx2';

      expect(instance1).to.not.equal(instance2);
      expect(instance1.value).to.equal('ctx1');
      expect(instance2.value).to.equal('ctx2');
    });
  });
});