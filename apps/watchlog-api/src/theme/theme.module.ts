import { Module } from "@nestjs/common";
import { ThemeController } from "./theme.controller";
import { ThemeService } from "./theme.service";

/** Apariencia / Temas administrables (EST-TEMAS). Paletas de marca publicables. */
@Module({
  controllers: [ThemeController],
  providers: [ThemeService],
  exports: [ThemeService],
})
export class ThemeModule {}
