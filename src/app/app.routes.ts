import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./av-schematic/pages/av-schematic-page.component').then(
        (m) => m.AvSchematicPageComponent,
      ),
  },
];
