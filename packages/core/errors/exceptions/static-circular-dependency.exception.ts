import { RuntimeException } from './runtime.exception';

export class StaticCircularDependencyException extends RuntimeException {
  constructor(
    dependencyType: 'module' | 'provider',
    cyclePath: string[],
  ) {
    const path = cyclePath.join(' -> ');
    const label =
      dependencyType === 'module'
        ? 'A circular module import dependency'
        : 'A circular provider dependency';
    super(
      `${label} has been detected at compile time.\n` +
        `Dependency chain: ${path}\n` +
        `Please use forwardRef() on both sides of the circular dependency to resolve this issue.\n` +
        `Read more: https://docs.nestjs.com/fundamentals/circular-dependency`,
    );
  }
}
