import { Inject, Injectable, Scope } from '@nestjs/common';
import { REQUEST, createContextId } from '@nestjs/core';
import { Test, TestingModule } from '..';

declare const require: any;

const { afterEach, beforeEach, describe, it } = require('mocha');
const { expect } = require('chai');

describe('TestingModule scoped providers', () => {
  @Injectable({ scope: Scope.REQUEST })
  class RequestScopedService {
    constructor(
      @Inject(REQUEST)
      public readonly request: {
        id: string;
      },
    ) {}
  }

  @Injectable({ scope: Scope.TRANSIENT })
  class TransientScopedService {
    public static counter = 0;
    public readonly id: number;

    constructor() {
      TransientScopedService.counter++;
      this.id = TransientScopedService.counter;
    }
  }

  @Injectable()
  class FirstConsumer {
    constructor(public readonly transient: TransientScopedService) {}
  }

  @Injectable()
  class SecondConsumer {
    constructor(public readonly transient: TransientScopedService) {}
  }

  let testingModule: TestingModule;

  beforeEach(async () => {
    TransientScopedService.counter = 0;
    testingModule = await Test.createTestingModule({
      providers: [
        RequestScopedService,
        TransientScopedService,
        FirstConsumer,
        SecondConsumer,
      ],
    }).compile();
  });

  afterEach(async () => {
    await testingModule.close();
  });

  describe('REQUEST scope', () => {
    it('should create one instance per context and reuse it within the same context', async () => {
      const contextId = createContextId();
      const request = { id: 'same-context' };

      testingModule.registerRequestByContextId(request, contextId);

      const instance1 = await testingModule.resolve(
        RequestScopedService,
        contextId,
      );
      const instance2 = await testingModule.resolve(
        RequestScopedService,
        contextId,
      );

      expect(instance1).to.be.instanceOf(RequestScopedService);
      expect(instance2).to.equal(instance1);
      expect(instance1.request).to.equal(request);
    });

    it('should isolate request-scoped instances across different contexts', async () => {
      const contextId1 = createContextId();
      const contextId2 = createContextId();
      const request1 = { id: 'request-1' };
      const request2 = { id: 'request-2' };

      testingModule.registerRequestByContextId(request1, contextId1);
      testingModule.registerRequestByContextId(request2, contextId2);

      const instance1 = await testingModule.resolve(
        RequestScopedService,
        contextId1,
      );
      const instance2 = await testingModule.resolve(
        RequestScopedService,
        contextId2,
      );

      expect(instance1).to.not.equal(instance2);
      expect(instance1.request).to.equal(request1);
      expect(instance2.request).to.equal(request2);
    });
  });

  describe('TRANSIENT scope', () => {
    it('should create a dedicated instance for each inquirer in the same testing module', () => {
      const firstConsumer = testingModule.get(FirstConsumer);
      const secondConsumer = testingModule.get(SecondConsumer);

      expect(firstConsumer.transient).to.be.instanceOf(TransientScopedService);
      expect(secondConsumer.transient).to.be.instanceOf(TransientScopedService);
      expect(firstConsumer.transient).to.not.equal(secondConsumer.transient);
      expect(firstConsumer.transient.id).to.not.equal(secondConsumer.transient.id);
    });

    it('should isolate direct transient resolutions across different contexts', async () => {
      const contextId1 = createContextId();
      const contextId2 = createContextId();

      const instance1 = await testingModule.resolve(
        TransientScopedService,
        contextId1,
      );
      const instance2 = await testingModule.resolve(
        TransientScopedService,
        contextId1,
      );
      const instance3 = await testingModule.resolve(
        TransientScopedService,
        contextId2,
      );

      expect(instance1).to.be.instanceOf(TransientScopedService);
      expect(instance2).to.equal(instance1);
      expect(instance3).to.not.equal(instance1);
    });
  });
});
