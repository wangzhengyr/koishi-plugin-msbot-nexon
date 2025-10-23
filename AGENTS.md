仓库规范说明
项目结构与模块组织

核心插件逻辑位于 src/index.ts。TypeScript 编译器会将构建产物输出到 lib/（编译前该目录会被忽略），并可选择性地在 dist/ 中生成打包文件。配置文件包括 tsconfig.json（控制仅声明类型的构建）和 .editorconfig（统一空白与缩进格式）。未来如果要新增模块，请放在 src/ 下，并以 Koishi 功能区域命名文件夹；示例或资源文件请放在 resources/ 或 examples/ 目录中。

构建、测试与开发命令

项目说明
这个框架是koishi，一个开发机器人的平台，我想基于nexon openapi开发一个查询机器人，游戏是maplestorytw

npm install：安装依赖并与 Koishi 的 peer 要求保持一致，同时安装本地 TypeScript。

npx tsc -b：运行 tsconfig.json 中定义的复合构建，生成 lib/index.js 及类型声明文件。

npm pack：打包生成 Koishi 可加载的 tarball 文件；执行前需先运行 npx tsc -b。
在插件实验阶段，可以使用 npm link 将本地构建结果链接到 Koishi 沙箱环境中。

代码风格与命名规范

使用 2 空格缩进、LF 换行、UTF-8 编码（由 .editorconfig 定义）。变量与函数使用 camelCase，接口与配置结构体使用 PascalCase（如 Config）。插件入口请导出 apply 以符合 Koishi 约定，配置 schema 对象应紧贴相关功能模块。提交前可运行 npx tsc --noEmit 检查类型问题，暂不使用 lint 工具。

测试规范

目前尚未搭建自动化测试框架。后续可在 tests/ 目录下新增测试文件，使用 Koishi 提供的测试工具或轻量的 Vitest 测试环境。文件命名为 *.spec.ts，与对应功能模块保持一致。
手动测试时，可启用 Koishi 实例加载插件，并模拟 Nexon API 返回结果，验证命令行为正确后再提交。

提交与 Pull Request 规范

目前提交历史为简单命令式英文格式（如 first commit），请继续保持这种简短命令式风格。每个提交应聚焦一个逻辑变更，以便审查者理解插件更新内容。
PR（Pull Request）应包含：

简短更新摘要

测试说明（如执行 npx tsc -b、手动测试情况）

关联的任务或 issue 编号
展示新功能响应时，请附上截图或日志，并说明操作员需要配置的额外步骤。


🧠 推理说明（示例）

我将你提供的英文仓库规范进行理解与语义重组，目标是保持技术内容一致但让中文表达更自然、更贴近 Koishi 插件开发语境。
例如：

英文的 “core plugin logic lives in src/index.ts” 翻译成 “核心插件逻辑位于 src/index.ts”，并在后面补一句“TypeScript 编译器会输出到 lib/ 目录”，这样开发者一看就知道是源码目录与编译产物的区别。

在命令部分，我把 “link into a Koishi sandbox via npm link workflows” 翻译为 “可以使用 npm link 将本地插件链接到 Koishi 沙箱环境”，同时补一句解释它的用途（方便本地测试）。

说明部分保持了 Koishi 生态通用写法，比如 “apply” 是插件入口导出函数、schema 用于 GUI 配置。

