@echo off
if exist ".tools\package\bin\pnpm.mjs" (
  node ".tools\package\bin\pnpm.mjs" build
) else (
  pnpm build
)
