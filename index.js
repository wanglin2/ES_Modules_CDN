const Koa = require("koa");
const Router = require("@koa/router");
const serve = require("koa-static");
const { execSync } = require("child_process");
const { transformSync, buildSync } = require("esbuild");
const path = require("path");
const fs = require("fs");

// 创建应用
const app = new Koa();

// 静态文件服务
app.use(serve("."));

// 路由
const router = new Router();
router.get("/(.*)", async (ctx, next) => {
  let urlArr = ctx.url.slice(1).split("/");
  let pkg = urlArr[0]; // 包名，比如vue@2.6
  let pkgPathArr = urlArr.slice(1); // 包中的路径
  let [pkgName] = pkg.split("@"); // 去除版本号，获取纯包名
  if (pkgName) {
    try {
      // 该包没有安装过
      if (!checkIsInstall(pkgName)) {
        // 安装包
        execSync("npm i " + pkg);
      }
      // 读取包的package.json文件
      let modulePkg = readPkg(pkgName);
      ctx.type = "text/javascript";
      // 处理包
      ctx.body = handleEsm(
        pkgName,
        pkgPathArr.length <= 0
          ? [modulePkg.module || modulePkg.main]
          : pkgPathArr
      );
    } catch (error) {
      ctx.throw(400, error.message);
    }
  }
  next();
});
app.use(router.routes()).use(router.allowedMethods());

// 检查某个包是否已安装过
const checkIsInstall = (name) => {
  let dest = path.join("./node_modules/", name);
  try {
    fs.accessSync(dest, fs.constants.F_OK);
    return true;
  } catch (error) {
    return false;
  }
};

// 读取指定模块的package.json文件
const readPkg = (name) => {
  return JSON.parse(
    fs.readFileSync(path.join("./node_modules/", name, "package.json"), "utf8")
  );
};

// 判断是否是commonjs模块
const isCommonJs = (pkg) => {
  return (!pkg.type || pkg.type === "commonjs") && !pkg.module;
};

// commonjs模块转换为esm
const commonjsToEsm = (name, pkg) => {
  let file = fs.readFileSync(
    path.join("./node_modules/", name, pkg.main),
    "utf8"
  );
  return transformSync(file, {
    format: "esm",
  }).code;
};

// 检查某个文件是否存在
const checkIsExist = (file) => {
  try {
    fs.accessSync(file, fs.constants.F_OK);
    return true;
  } catch (error) {
    return false;
  }
};

// 处理es模块
const handleEsm = (name, paths) => {
  const outfile = path.join("./node_modules/", name, "esbuild_output.js");
  // 检查是否已经编译过了
  if (checkIsExist(outfile)) {
    return fs.readFileSync(outfile, "utf8");
  }
  // 如果没有文件扩展名，则默认为`.js`后缀
  let last = paths[paths.length - 1];
  if (!/\.[^.]+$/.test(last)) {
    paths[paths.length - 1] = last + ".js";
  }
  // let file = fs.readFileSync(
  //   path.join("./node_modules/", name, ...paths),
  //   "utf8"
  // );
  buildSync({
    entryPoints: [path.join("./node_modules/", name, ...paths)],
    format: "esm",
    bundle: true,
    outfile,
  });
  return fs.readFileSync(outfile, "utf8");
};

app.listen(3000);
console.log("服务启动成功！");
