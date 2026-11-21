@echo off
if exist ".tools\package\bin\pnpm.mjs" (
  node ".tools\package\bin\pnpm.mjs" dev --host 127.0.0.1
) else (
  pnpm dev --host 127.0.0.1
)
