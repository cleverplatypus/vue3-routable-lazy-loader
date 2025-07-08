# vue3-routable-lazy-loader

A vite plugin to enable lazy loading to vue3-routable projects.

## Usage

```ts
import { vue3RoutablePlugin } from 'vue3-routable-lazy-loader'

export default defineConfig({
  plugins: [vue3RoutablePlugin({ paths: ['src/controllers'] })],
})
```

Your vue3-routable project will now be able to lazy load controllers based on the @Routable decorator or your files' ROUTABLE_TARGETS const export.

## Example

When dealing with route matching that are specific for an instance of a Routable class, you can use the @RouteMatcher decorator in combination with the ROUTABLE_TARGETS special export.

The following example shows how to lazy load a controller instance based on the route name.

```ts
// src/controllers/my-controller.ts

/* 
    this export will be detected by the plugin and added to the registry so that when a route matches one of these strings, the file containing your controller will be loaded just in time for activation
*/
export const ROUTABLE_TARGETS = [ 
  'some-route',
  'some-other-route',
] 
  
export default new SomeGenericRoutableController({
    routes: ROUTABLE_TARGETS,
})
```

```ts
// src/controllers/SomeGenericRoutableController.ts

@Routable()
export default class SomeGenericRoutableController {
    private targetRoutes: string[]
    
    constructor({routes}: {routes: string[]}) {
        this.targetRoutes = routes
    }
    
    @RouteMatcher()
    shouldActivate(route: RouteLocation) {
        return this.targetRoutes.includes(route.name as string)
    }
```
