# 公式工坊 · Formula Studio

一个“公式优先”的轻量文档编辑器原型。目标不是复制完整 Word，而是验证三件事：

1. 把线性公式当普通文字输入，选中后转换为可编辑公式。
2. 用户可以用自定义模板定义自己的公式写法。
3. 导出的 DOCX 中，公式是 Word 原生 OMML，而不是图片。

## 当前功能

- `Ctrl + Enter`：选中线性文本后转换为公式；选中公式后还原为源码
- 富文本编辑：标题、粗体、斜体、列表、撤销/重做
- 公式输入台：实时 MathLive 预览、插入文档、复制 LaTeX/OMML
- 内置模板：`sigma`、`sum`、`integral`、`int`、`limit`、`absval`
- 自定义模板：触发词、参数、展开表达式、使用示例
- 自定义模板保存在浏览器 `localStorage`
- 文档本地自动保存
- 导出 `.docx`，公式写入 OMML
- 支持常见线性写法：
  - `a/b`
  - `x^2`
  - `x_i`
  - `sqrt(x^2+1)`
  - `sum_(i=1)^n i^2`
  - `int_0^1 f(x) dx`
  - `sigma(1,n){i^2}`
  - `\frac{a}{b}`

## 启动

如果本机有 `pnpm`：

```powershell
pnpm install
pnpm dev
```

本工作区当前没有全局 npm，因此包含一个本地工具链入口：

```powershell
node .tools\package\bin\pnpm.mjs dev --host 127.0.0.1
```

也可以直接双击 `start.cmd`。

打开：

```text
http://127.0.0.1:5173/
```

## 测试和构建

```powershell
node .tools\package\bin\pnpm.mjs test
node .tools\package\bin\pnpm.mjs build
```

或双击 `build.cmd`。

## 代码结构

```text
src/
  App.tsx                    主界面和文档交互
  components/
    FormulaEditorDialog.tsx  公式编辑弹窗
    MathLivePreview.tsx      MathLive 预览层
    TemplateDialog.tsx       自定义模板编辑器
  editor/
    FormulaNode.tsx          Tiptap 公式节点
  formula/
    parser.ts                线性语法 → AST
    templates.ts             模板展开
    latex.ts                 AST → LaTeX
    omml.ts                  AST → OMML
    engine.test.ts           解析、OMML、DOCX 测试
  export/
    docx.ts                  DOCX 打包与 OMML 写入
```

## 当前边界

- 第一版只支持单段落文本转换
- 矩阵、分段函数、复杂排版尚未实现
- MathLive 当前用于预览；后续可以升级为直接可视化编辑
- OMML 目前由项目内的适配器生成，后续可替换为 `texmath` 或 `mathml_to_omml` 服务
- `texmath` 是 GPL-2.0；`mathml_to_omml` 的许可证需要进一步确认
- 完整 Word 排版（分页、页眉页脚、表格、批注、修订、协作）不在当前范围

## 最近更新

- 新增矩阵：`matrix(a,b;c,d)`、`bmatrix(1,0;0,1)`、`pmatrix(...)`、`vmatrix(...)`
- 新增分段函数：`cases(x^2,x>=0;-x,x<0)`
- MathLive 预览已升级为可视化编辑：修改会回写到线性源码，并继续走 AST/OMML 导出链路
- 公式旁增加“编辑”和“还原源码”按钮

## DOCX 导入与公式稳定性

- 支持导入 `.docx`，读取 Word 段落、标题、粗体/斜体和 OMML 公式
- 导入后的 OMML 会原样保留，再次导出仍为 Word 原生公式
- 支持独立公式与行内公式切换
- 支持多行对齐：`align(x=1;y=2)`
- 支持 `matrix`、`bmatrix`、`pmatrix`、`vmatrix`、`cases`
- MathLive 修改会通过 LaTeX 适配器同步回线性源码

## Cloud workspace

- Supabase Auth email magic-link login
- Cloud documents stored in PostgreSQL
- Per-user RLS isolation
- Autosave after opening/saving a cloud document
- Share links backed by `get_shared_document` and unguessable tokens
- Local developer setup is in `supabase/README.md` and `supabase/schema.sql`
- GitHub Actions reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from repository variables

## Word fidelity and code splitting

- DOCX import now keeps the original DOCX package in memory for faithful export.
- Faithful export patches edited OMML formulas directly inside `word/document.xml`.
- Tables, images, comments, headers/footers and complex page layout remain in the original package.
- Text changes are not written in faithful mode; use "切换普通导出" for that.
- MathLive, Supabase, JSZip, DOCX import/export and KaTeX are split into separate production chunks.

## Additional formula constructs

- Derivatives: `f'(x)`, `f''(x)`
- Partial derivatives: `partial f / partial x`
- Del operator: `nabla f`
- Accents: `vec(a)`, `hat(x)`, `bar(y)`, `tilde(x)`, `dot(x)`, `ddot(x)`
- Extensible marks: `overline(x)`, `underline(x)`, `overbrace(x)`, `underbrace(x)`
- Binomials: `binom(n,k)`
- Augmented matrices: `augmatrix(1,2|3;4,5|6)`
- Explicit alignment: `align(x&=1;y&=2)`

## Equation numbering and references

- Numbered display formulas: `公式编辑 → 自动编号`
- Labels are stable, e.g. `eq1`, `eq2`
- Reference button lists all numbered formulas and inserts an inline reference
- Text syntax: select `eqref(eq1)` and press `Ctrl+Enter`
- References automatically follow equation order changes
- DOCX normal export writes the number on the right side of the formula
- Fidelity export still only rewrites formula OMML; numbering changes require normal export
