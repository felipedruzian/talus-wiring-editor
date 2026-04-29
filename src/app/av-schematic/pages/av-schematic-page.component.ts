import { ChangeDetectionStrategy, Component } from '@angular/core';
import { provideNgDiagram } from 'ng-diagram';
import { DiagramComponent } from '../diagram/diagram.component';
import { BendPointDragService } from '../diagram/edge-routing/bend-point-drag.service';
import { ModelApplyService } from '../diagram/model/model-apply.service';
import { NodeVisibilityConfigService } from '../diagram/node-visibility/node-visibility-config.service';
import { PortFocusService } from '../diagram/port-focus.service';
import { ViewportAnimationService } from '../diagram/viewport-animation.service';
import { ViewportBoundsDirective } from '../diagram/node-visibility/viewport-bounds.directive';
import { ViewportOverlayDirective } from '../diagram/node-visibility/viewport-overlay.directive';
import { LibrarySidebarComponent } from '../library-sidebar/library-sidebar.component';
import { LibraryService } from '../library-sidebar/library.service';
import { MinimapPanelComponent } from '../minimap-panel/minimap-panel.component';
import { DiagramExportService } from '../export/diagram-export.service';
import { ElementMutationService } from '../properties-sidebar/element-mutation.service';
import { PropertiesSidebarComponent } from '../properties-sidebar/properties-sidebar.component';
import { PropertiesSidebarService } from '../properties-sidebar/properties-sidebar.service';
import { ToolbarComponent } from '../toolbar/toolbar.component';
import { TopNavbarComponent } from '../top-navbar/top-navbar.component';

@Component({
  selector: 'app-av-schematic-page',
  imports: [
    DiagramComponent,
    LibrarySidebarComponent,
    PropertiesSidebarComponent,
    TopNavbarComponent,
    MinimapPanelComponent,
    ToolbarComponent,
    ViewportBoundsDirective,
    ViewportOverlayDirective,
  ],
  templateUrl: './av-schematic-page.component.html',
  styleUrl: './av-schematic-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideNgDiagram(),
    PropertiesSidebarService,
    ElementMutationService,
    ModelApplyService,
    NodeVisibilityConfigService,
    ViewportAnimationService,
    PortFocusService,
    LibraryService,
    DiagramExportService,
    BendPointDragService,
  ],
})
export class AvSchematicPageComponent {}
