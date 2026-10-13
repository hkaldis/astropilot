import { lazy, type LazyExoticComponent, type ComponentType } from "react";
import type { GlossaryWidget } from "@shared/glossary";

/** Each demo is its own small chunk, loaded when its term's page opens. */
export const WIDGETS: Record<GlossaryWidget, LazyExoticComponent<ComponentType>> = {
  magnitude: lazy(() => import("./MagnitudeWidget")),
  angular: lazy(() => import("./AngularWidget")),
  eyepiece: lazy(() => import("./EyepieceWidget")),
  bortle: lazy(() => import("./BortleWidget")),
  seeing: lazy(() => import("./SeeingWidget")),
  transparency: lazy(() => import("./TransparencyWidget")),
  altaz: lazy(() => import("./AltAzWidget")),
  phase: lazy(() => import("./PhaseWidget")),
  resolution: lazy(() => import("./ResolutionWidget")),
  twilight: lazy(() => import("./TwilightWidget")),
  coma: lazy(() => import("./ComaWidget")),
  pa: lazy(() => import("./PAWidget")),
};

export const WIDGET_TITLE: Record<GlossaryWidget, string> = {
  magnitude: "Slide along the magnitude scale",
  angular: "Compare sizes with the full Moon",
  eyepiece: "Build a view: telescope, eyepiece, Barlow",
  bortle: "Dim the city lights",
  seeing: "Steady the air",
  transparency: "Clear the haze",
  altaz: "Drag a star across the sky",
  phase: "Run through a month of Moon",
  resolution: "Split a double star",
  twilight: "Set the Sun",
  coma: "See coma — and correct it",
  pa: "Place the companion star",
};
