import { Inject, Injectable, Scope } from '@nestjs/common';
import { ContextIdFactory } from '@nestjs/core/helpers/context-id-factory';
import { Test } from '@nestjs/testing';
import { expect } from 'chai';

describe('TestingModule - Scope Providers', () => {
  describe('REQUEST scope provider', () => {
    let instanceCounter = 0;

    @Injectable({ scope: Scope.REQUEST })
    class RequestScopedService {
      public readonly instanceId: number;

      constructor() {
        instanceCounter++;
        this.instanceId = instanceCounter;
      }
    }

    @Injectable()
    class DefaultScopedConsumer {
      constructor(public readonly requestService: RequestScopedService) {}
    }

    beforeEach(() => {
      instanceCounter = 0;
    });

    describe('instance generation rules', () => {
      it('should create a new instance when resolve() is called without contextId', async () => {
        const module = await Test.createTestingModule({
          providers: [RequestScopedService],
        }).compile();

        const instance1 = await module.resolve(RequestScopedService);
        const instance2 = await module.resolve(RequestScopedService);

        expect(instance1).to.be.instanceOf(RequestScopedService);
        expect(instance2).to.be.instanceOf(RequestScopedService);
        expect(instance1.instanceId).to.not.equal(instance2.instanceId);
      });

      it('should create a new instance for each unique contextId', async () => {
        const module = await Test.createTestingModule({
          providers: [RequestScopedService],
        }).compile();

        const contextId1 = ContextIdFactory.create();
        const contextId2 = ContextIdFactory.create();

        const instance1 = await module.resolve(RequestScopedService, contextId1);
        const instance2 = await module.resolve(RequestScopedService, contextId2);

        expect(instance1.instanceId).to.not.equal(instance2.instanceId);
      });

      it('should return the same instance for the same contextId', async () => {
        const module = await Test.createTestingModule({
          providers: [RequestScopedService],
        }).compile();

        const contextId = ContextIdFactory.create();

        const instance1 = await module.resolve(RequestScopedService, contextId);
        const instance2 = await module.resolve(RequestScopedService, contextId);

        expect(instance1.instanceId).to.equal(instance2.instanceId);
        expect(instance1).to.equal(instance2);
      });
    });

    describe('instance isolation', () => {
      it('should isolate instances across different request contexts', async () => {
        const module = await Test.createTestingModule({
          providers: [RequestScopedService],
        }).compile();

        const contextId1 = ContextIdFactory.create();
        const contextId2 = ContextIdFactory.create();

        const instance1Ctx1 = await module.resolve(RequestScopedService, contextId1);
        const instance2Ctx1 = await module.resolve(RequestScopedService, contextId1);
        const instance1Ctx2 = await module.resolve(RequestScopedService, contextId2);

        expect(instance1Ctx1).to.equal(instance2Ctx1);
        expect(instance1Ctx1.instanceId).to.not.equal(instance1Ctx2.instanceId);
      });

      it('should maintain separate instance state per context', async () => {
        @Injectable({ scope: Scope.REQUEST })
        class StatefulRequestService {
          public data: string;

          constructor() {
            this.data = 'initial';
          }
        }

        const module = await Test.createTestingModule({
          providers: [StatefulRequestService],
        }).compile();

        const contextId1 = ContextIdFactory.create();
        const contextId2 = ContextIdFactory.create();

        const instance1 = await module.resolve(StatefulRequestService, contextId1);
        const instance2 = await module.resolve(StatefulRequestService, contextId2);

        instance1.data = 'modified-context-1';
        instance2.data = 'modified-context-2';

        expect(instance1.data).to.equal('modified-context-1');
        expect(instance2.data).to.equal('modified-context-2');
      });

      it('should allow registering request objects per contextId', async () => {
        @Injectable({ scope: Scope.REQUEST })
        class RequestObjectService {
          constructor(@Inject('REQUEST') public readonly request: any) {}
        }

        const module = await Test.createTestingModule({
          providers: [
            RequestObjectService,
            {
              provide: 'REQUEST',
              useFactory: () => ({}),
              scope: Scope.REQUEST,
            },
          ],
        }).compile();

        const contextId1 = ContextIdFactory.create();
        const contextId2 = ContextIdFactory.create();

        module.registerRequestByContextId({ userId: 1 }, contextId1);
        module.registerRequestByContextId({ userId: 2 }, contextId2);

        const request1 = await module.resolve('REQUEST', contextId1);
        const request2 = await module.resolve('REQUEST', contextId2);

        expect(request1.userId).to.equal(1);
        expect(request2.userId).to.equal(2);
      });
    });

    describe('with dependency injection', () => {
      it('should inject request-scoped dependencies correctly', async () => {
        @Injectable({ scope: Scope.REQUEST })
        class RequestScopedDependency {
          public readonly createdAt: Date;

          constructor() {
            this.createdAt = new Date();
          }
        }

        @Injectable({ scope: Scope.REQUEST })
        class RequestScopedWithDependency {
          constructor(
            public readonly dependency: RequestScopedDependency,
          ) {}
        }

        const module = await Test.createTestingModule({
          providers: [RequestScopedDependency, RequestScopedWithDependency],
        }).compile();

        const contextId = ContextIdFactory.create();

        const service = await module.resolve(RequestScopedWithDependency, contextId);
        const dependency = await module.resolve(RequestScopedDependency, contextId);

        expect(service.dependency).to.equal(dependency);
      });
    });
  });

  describe('TRANSIENT scope provider', () => {
    let instanceCounter = 0;

    @Injectable({ scope: Scope.TRANSIENT })
    class TransientScopedService {
      public readonly instanceId: number;

      constructor() {
        instanceCounter++;
        this.instanceId = instanceCounter;
      }
    }

    @Injectable()
    class DefaultScopedService {
      constructor(public readonly transient: TransientScopedService) {}
    }

    beforeEach(() => {
      instanceCounter = 0;
    });

    describe('instance generation rules', () => {
      it('should create a new instance every time resolve() is called', async () => {
        const module = await Test.createTestingModule({
          providers: [TransientScopedService],
        }).compile();

        const instance1 = await module.resolve(TransientScopedService);
        const instance2 = await module.resolve(TransientScopedService);

        expect(instance1).to.be.instanceOf(TransientScopedService);
        expect(instance2).to.be.instanceOf(TransientScopedService);
        expect(instance1.instanceId).to.not.equal(instance2.instanceId);
      });

      it('should create a new instance for each resolve() call even with same contextId', async () => {
        const module = await Test.createTestingModule({
          providers: [TransientScopedService],
        }).compile();

        const contextId = ContextIdFactory.create();

        const instance1 = await module.resolve(TransientScopedService, contextId);
        const instance2 = await module.resolve(TransientScopedService, contextId);

        expect(instance1.instanceId).to.not.equal(instance2.instanceId);
      });

      it('should create different instances for different contextIds', async () => {
        const module = await Test.createTestingModule({
          providers: [TransientScopedService],
        }).compile();

        const contextId1 = ContextIdFactory.create();
        const contextId2 = ContextIdFactory.create();

        const instance1 = await module.resolve(TransientScopedService, contextId1);
        const instance2 = await module.resolve(TransientScopedService, contextId2);

        expect(instance1.instanceId).to.not.equal(instance2.instanceId);
      });
    });

    describe('instance isolation', () => {
      it('should always create fresh instances regardless of context', async () => {
        const module = await Test.createTestingModule({
          providers: [TransientScopedService],
        }).compile();

        const instance1 = await module.resolve(TransientScopedService);
        const instance2 = await module.resolve(TransientScopedService);
        const instance3 = await module.resolve(TransientScopedService);

        expect(instance1.instanceId).to.not.equal(instance2.instanceId);
        expect(instance2.instanceId).to.not.equal(instance3.instanceId);
        expect(instance1.instanceId).to.not.equal(instance3.instanceId);
      });

      it('should maintain independent state for each instance', async () => {
        @Injectable({ scope: Scope.TRANSIENT })
        class StatefulTransientService {
          public counter: number;

          constructor() {
            this.counter = 0;
          }
        }

        const module = await Test.createTestingModule({
          providers: [StatefulTransientService],
        }).compile();

        const instance1 = await module.resolve(StatefulTransientService);
        const instance2 = await module.resolve(StatefulTransientService);

        instance1.counter = 10;
        instance2.counter = 20;

        expect(instance1.counter).to.equal(10);
        expect(instance2.counter).to.equal(20);
      });
    });

    describe('with dependency injection', () => {
      it('should inject transient dependencies as new instances', async () => {
        @Injectable({ scope: Scope.TRANSIENT })
        class TransientDependency {
          public readonly createdAt: Date;

          constructor() {
            this.createdAt = new Date();
          }
        }

        @Injectable({ scope: Scope.TRANSIENT })
        class TransientWithDependency {
          constructor(
            public readonly dependency: TransientDependency,
          ) {}
        }

        const module = await Test.createTestingModule({
          providers: [TransientDependency, TransientWithDependency],
        }).compile();

        const service1 = await module.resolve(TransientWithDependency);
        const service2 = await module.resolve(TransientWithDependency);

        expect(service1.dependency).to.not.equal(service2.dependency);
        expect(service1).to.not.equal(service2);
      });

      it('should inject transient dependency into default scoped service', async () => {
        const module = await Test.createTestingModule({
          providers: [TransientScopedService, DefaultScopedService],
        }).compile();

        const defaultService = module.get(DefaultScopedService);

        expect(defaultService.transient).to.be.instanceOf(TransientScopedService);
      });

      it('should create new transient instances for each default scoped instance', async () => {
        @Injectable({ scope: Scope.TRANSIENT })
        class TransientForDefault {
          public readonly instanceId: number;
          private static counter = 0;

          constructor() {
            TransientForDefault.counter++;
            this.instanceId = TransientForDefault.counter;
          }
        }

        @Injectable()
        class DefaultWithTransient {
          constructor(public readonly transient: TransientForDefault) {}
        }

        const module = await Test.createTestingModule({
          providers: [
            TransientForDefault,
            DefaultWithTransient,
            {
              provide: 'DEFAULT_1',
              useClass: DefaultWithTransient,
            },
            {
              provide: 'DEFAULT_2',
              useClass: DefaultWithTransient,
            },
          ],
        }).compile();

        const instance1 = module.get('DEFAULT_1') as DefaultWithTransient;
        const instance2 = module.get('DEFAULT_2') as DefaultWithTransient;

        expect(instance1.transient.instanceId).to.not.equal(
          instance2.transient.instanceId,
        );
      });
    });
  });

  describe('REQUEST vs TRANSIENT comparison', () => {
    it('should behave differently: REQUEST reuses within context, TRANSIENT always creates new', async () => {
      @Injectable({ scope: Scope.REQUEST })
      class RequestService {
        public readonly instanceId: number;
        private static counter = 0;

        constructor() {
          RequestService.counter++;
          this.instanceId = RequestService.counter;
        }
      }

      @Injectable({ scope: Scope.TRANSIENT })
      class TransientService {
        public readonly instanceId: number;
        private static counter = 0;

        constructor() {
          TransientService.counter++;
          this.instanceId = TransientService.counter;
        }
      }

      const module = await Test.createTestingModule({
        providers: [RequestService, TransientService],
      }).compile();

      const contextId = ContextIdFactory.create();

      const request1 = await module.resolve(RequestService, contextId);
      const request2 = await module.resolve(RequestService, contextId);

      const transient1 = await module.resolve(TransientService, contextId);
      const transient2 = await module.resolve(TransientService, contextId);

      expect(request1).to.equal(request2);
      expect(transient1).to.not.equal(transient2);
    });
  });
});
