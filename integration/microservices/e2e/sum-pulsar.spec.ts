import { expect } from 'chai';
import { PulsarController } from '../src/pulsar/pulsar.controller';

describe.skip('Pulsar transport', () => {
  it('should expose a controller that references the Pulsar transport', () => {
    expect(PulsarController).to.not.be.undefined;
  });
});
