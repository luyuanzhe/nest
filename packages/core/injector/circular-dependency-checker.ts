import { PARAMTYPES_METADATA } from '@nestjs/common/constants';
import { InjectionToken, Type } from '@nestjs/common/interfaces';
import { isFunction } from '@nestjs/common/utils/shared.utils';
import { StaticCircularDependencyException } from '../errors/exceptions/static-circular-dependency.exception';
import { InstanceWrapper } from './instance-wrapper';
import { Module } from './module';
import { ModulesContainer } from './modules-container';

export class CircularDependencyChecker {
  public static check(modulesContainer: ModulesContainer): void {
    this.checkModuleCircularDependencies(modulesContainer);
    this.checkProviderCircularDependencies(modulesContainer);
  }

  public static checkModuleCircularDependencies(
    modulesContainer: ModulesContainer,
  ): void {
    const modules = Array.from(modulesContainer.values());
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const path: Array<{ name: string; token: string }> = [];

    for (const module of modules) {
      if (!visited.has(module.token)) {
        this.detectModuleCycle(module, visited, recursionStack, path);
      }
    }
  }

  private static detectModuleCycle(
    module: Module,
    visited: Set<string>,
    recursionStack: Set<string>,
    path: Array<{ name: string; token: string }>,
  ): void {
    visited.add(module.token);
    recursionStack.add(module.token);
    path.push({ name: module.name, token: module.token });

    for (const importedModule of module.imports) {
      if (!importedModule) {
        continue;
      }

      if (module.isForwardRefImport(importedModule)) {
        continue;
      }

      if (!visited.has(importedModule.token)) {
        this.detectModuleCycle(importedModule, visited, recursionStack, path);
      } else if (recursionStack.has(importedModule.token)) {
        const cycleStartIndex = path.findIndex(
          p => p.token === importedModule.token,
        );
        const cyclePath = path
          .slice(cycleStartIndex)
          .map(p => p.name)
          .concat([importedModule.name]);
        throw new StaticCircularDependencyException('module', cyclePath);
      }
    }

    recursionStack.delete(module.token);
    path.pop();
  }

  public static checkProviderCircularDependencies(
    modulesContainer: ModulesContainer,
  ): void {
    const modules = Array.from(modulesContainer.values());

    for (const module of modules) {
      const providers = module.getNonAliasProviders();
      for (const [token, wrapper] of providers) {
        if (!wrapper.metatype || wrapper.forwardRef) {
          continue;
        }

        const visited = new Set<string>();
        const recursionStack = new Set<string>();
        const path: string[] = [];

        this.detectProviderCycle(
          wrapper,
          module,
          visited,
          recursionStack,
          path,
        );
      }
    }
  }

  private static detectProviderCycle(
    wrapper: InstanceWrapper,
    module: Module,
    visited: Set<string>,
    recursionStack: Set<string>,
    path: string[],
  ): void {
    const wrapperId = wrapper.id;
    visited.add(wrapperId);
    recursionStack.add(wrapperId);

    const wrapperName =
      typeof wrapper.name === 'string'
        ? wrapper.name
        : wrapper.token?.toString() || 'Unknown';
    path.push(wrapperName);

    const dependencies = this.getProviderDependencies(wrapper, module);

    for (const depWrapper of dependencies) {
      if (!depWrapper || depWrapper.forwardRef) {
        continue;
      }

      const depId = depWrapper.id;
      const depName =
        typeof depWrapper.name === 'string'
          ? depWrapper.name
          : depWrapper.token?.toString() || 'Unknown';

      if (!visited.has(depId)) {
        this.detectProviderCycle(depWrapper, depWrapper.host || module, visited, recursionStack, path);
      } else if (recursionStack.has(depId)) {
        const cycleStartIndex = path.indexOf(depName);
        const cyclePath =
          cycleStartIndex >= 0
            ? path.slice(cycleStartIndex).concat([depName])
            : path.concat([depName]);
        throw new StaticCircularDependencyException('provider', cyclePath);
      }
    }

    recursionStack.delete(wrapperId);
    path.pop();
  }

  private static getProviderDependencies(
    wrapper: InstanceWrapper,
    module: Module,
  ): InstanceWrapper[] {
    const dependencies: InstanceWrapper[] = [];

    if (wrapper.inject) {
      for (const injectToken of wrapper.inject) {
        const resolvedToken = this.resolveInjectToken(injectToken);
        const depWrapper = this.resolveProvider(resolvedToken, module);
        if (depWrapper) {
          dependencies.push(depWrapper);
        }
      }
    } else if (wrapper.metatype && isFunction(wrapper.metatype)) {
      const paramTypes: Type[] =
        Reflect.getMetadata(PARAMTYPES_METADATA, wrapper.metatype) || [];
      for (const paramType of paramTypes) {
        const depWrapper = this.resolveProvider(paramType, module);
        if (depWrapper) {
          dependencies.push(depWrapper);
        }
      }
    }

    return dependencies;
  }

  private static resolveInjectToken(
    injectToken: any,
  ): InjectionToken {
    if (injectToken && typeof injectToken === 'object' && 'token' in injectToken) {
      return injectToken.token;
    }
    return injectToken;
  }

  private static resolveProvider(
    token: InjectionToken,
    module: Module,
  ): InstanceWrapper | null {
    if (module.providers.has(token)) {
      return module.providers.get(token)!;
    }

    for (const importedModule of module.imports) {
      if (
        importedModule.exports.has(token) &&
        importedModule.providers.has(token)
      ) {
        return importedModule.providers.get(token)!;
      }
    }

    return null;
  }
}
