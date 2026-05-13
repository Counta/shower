# Shower API Notes

基于当前对 `yushi.tjnu.edu.cn:61004/brmcsf` 的前端与网络请求观察整理。

## Base URL

```text
http://yushi.tjnu.edu.cn:61004/brmcsf/
```

## 认证说明

- 登录前：无需 `token`、`loginid`
- 登录后：多数业务接口需要在请求头里带

```text
token: <JWT>
loginid: <用户ID>
```

## 1. 登录

**Method**

```text
POST /api/logon/login?time=<timestamp>
```

**Headers**

```text
Content-Type: application/json
```

**Body**

```json
{
  "code": "2530090187",
  "password": "<md5后的密码>"
}
```

**说明**

- `code` 是账号
- `password` 不是明文，前端先做一次 MD5
- `time` 看起来主要用于防缓存，不是核心校验项

**成功响应示例**

```json
{
  "message": "Ok",
  "code": 200,
  "data": {
    "loginid": 59263,
    "token": "<JWT>",
    "student": null,
    "succeed": "Y",
    "bookOrderList": []
  }
}
```

- `data.loginid` 为数字用户 ID，与 `data.token` 一起用于后续请求头；定时脚本 `conf/accounts.env` 里的 `LOGINID_<学号>` 与此值一致，也可由前端调用本登录接口后读取并写入配置。

**失败响应示例**

```json
{
  "message": "customer Error",
  "code": 1001,
  "data": {}
}
```

## 2. 获取当前用户信息

**Method**

```text
GET /api/logon/getUserMessage?time=<timestamp>&_=<timestamp>
```

**Headers**

```text
token: <JWT>
loginid: <用户ID>
```

**作用**

- 获取当前登录用户信息

## 3. 获取浴室列表

**Method**

```text
POST /api/bathRoom/listRoom?time=<timestamp>
```

**Headers**

```text
token: <JWT>
loginid: <用户ID>
Content-Type: application/json
```

**Body**

```json
{}
```

**作用**

- 获取浴室列表

## 4. 获取浴室预约时段列表

**Method**

```text
POST /api/bathRoom/listBookStatus?time=<timestamp>&bathroomid=31
```

也可不带 `time`：

```text
POST /api/bathRoom/listBookStatus?bathroomid=31
```

**Headers**

```text
token: <JWT>
loginid: <用户ID>
Content-Type: application/json
```

**Body**

```json
{}
```

**作用**

- 获取某个浴室所有可预约时间段
- 返回每个时间段的 `id`、`period`、`remain` 等信息

**说明**

- `bathroomid` 是必需参数
- `time` 不是必需参数，去掉后仍可正常返回结果
- 这里返回的每个时段 `id`，就是后续预约使用的 `bookstatusid`

**响应片段示例**

```json
{
  "message": "Ok",
  "code": 200,
  "data": {
    "bookStatusList": [
      {
        "id": 1194,
        "bathRoomId": 31,
        "period": "18:00-18:15",
        "maxBookNum": 24,
        "bookNum": 9,
        "remain": 15,
        "state": true
      },
      {
        "id": 1212,
        "bathRoomId": 31,
        "period": "22:30-22:45",
        "maxBookNum": 24,
        "bookNum": 24,
        "remain": 0,
        "state": true
      }
    ]
  }
}
```

## 5. 提交预约

**Method**

```text
POST /api/bathRoom/bookOrder?time=<timestamp>&bookstatusid=<id>
```

**Headers**

```text
token: <JWT>
loginid: <用户ID>
Content-Type: application/json
```

**Body**

```json
{}
```

**作用**

- 直接提交预约
- 同一个接口同时承担“检查是否允许预约”和“实际执行预约”两件事

**说明**

- `bookstatusid` 对应 `listBookStatus` 返回的时段 ID
- 后端根据这个 ID 判断具体预约哪个时间段

**典型返回**

`data.succeed` 可能为：

- `Y`：预约成功
- `N`：预约失败，通常表示已满或未通过后端校验
- `P`：预约失败，此时间段已过去
- `Q`：预约失败，用户已经预约了此时段

**成功响应片段示例**

```json
{
  "message": "Ok",
  "code": 200,
  "data": {
    "bookOrderList": [
      {
        "id": 9990281,
        "bathRoomId": 31,
        "studentId": 59263,
        "period": "18:00-18:15",
        "bookStatusId": 1194,
        "bathRoomName": "34号楼公寓浴室",
        "orderNo": "8944700",
        "cardNo": 2530090187
      }
    ],
    "succeed": "Y",
    "classRoomOrderList": []
  }
}
```

**失败响应片段示例**

```json
{
  "message": "Ok",
  "code": 200,
  "data": {
    "bookOrderList": [],
    "succeed": "N",
    "classRoomOrderList": []
  }
}
```

## 6. 取消预约

**Method**

```text
POST /api/bathRoom/cancelOrder?time=<timestamp>&bookorderid=<id>
```

**Headers**

```text
token: <JWT>
loginid: <用户ID>
Content-Type: application/json
```

**Body**

```json
{}
```

**作用**

- 取消当前用户的一条预约单

**说明**

- `bookorderid` 是预约单 ID
- 这个 ID 来自：
  - `getBookOrderList` 返回的 `bookOrderList[].id`
  - 或预约成功响应里的 `bookOrderList[].id`
- 前端调用函数名可见为 `cancelorder(id)`

**前端实现片段**

```js
var urlTemp = server_api_url_pre + "api/bathRoom/cancelOrder?time=" + timestamp2;
urlTemp = urlTemp + '&bookorderid=' + id;
```

**典型返回**

前端按 `data.succeed` 判断：

- `Y`：取消成功
- 其他：取消失败

**成功响应结构示意**

```json
{
  "message": "Ok",
  "code": 200,
  "data": {
    "bookOrderList": [],
    "succeed": "Y",
    "classRoomOrderList": []
  }
}
```

**失败响应结构示意**

```json
{
  "message": "Ok",
  "code": 200,
  "data": {
    "bookOrderList": [],
    "succeed": "N",
    "classRoomOrderList": []
  }
}
```

## 7. 获取当前用户预约单列表

**Method**

```text
GET /api/bathRoom/getBookOrderList?time=<timestamp>
```

**Headers**

```text
token: <JWT>
loginid: <用户ID>
```

**作用**

- 获取当前用户已预约的订单列表

**响应字段补充观察**

- `bookOrderList[].status` 可用于表示预约单状态，前端已有如下映射：
  - `0`：已预约
  - `1`：已扫码进入
  - `2`：已完成
  - `3`：已超时
  - `4`：已归档

**响应结构片段示意**

```json
{
  "message": "Ok",
  "code": 200,
  "data": {
    "bookOrderList": [
      {
        "id": 9990281,
        "orderNo": "8946090",
        "period": "22:15-22:30",
        "bathRoomName": "34号楼公寓浴室",
        "status": "3",
        "category": "A"
      }
    ],
    "classRoomOrderList": []
  }
}
```

## 8. 本机写入 `conf/accounts.env`（自建，非浴室后端）

静态网页里的 JavaScript **不能**直接写服务器磁盘（即使页面与 `conf` 在同一台机器上；JS 在用户浏览器里执行）。

仓库提供 **`scripts/save_accounts_conf_server.py`**，监听本机回环端口，由 **Nginx 反代** 暴露给浏览器。推荐 **合并写入**：浏览器只提交 **账号 JSON**，服务端读取现有 `accounts.env`、更新 `ACCOUNTS` 与 `LOGINID_*` 后写回，**不必上传整份 conf**，也**不必**把 Bearer 密钥写进网页。

### 8.1 合并写入（推荐）

**Method**

```text
POST /merge-accounts-env
POST /api/merge-accounts-env
```

**Headers**

```text
Content-Type: application/json; charset=utf-8
X-Shower-Internal: 1
```

- **`X-Shower-Internal`** 必须由 **Nginx** 使用 `proxy_set_header X-Shower-Internal 1;` 注入（覆盖客户端传入值）。后端仅监听 `127.0.0.1` 时，公网无法绕过 Nginx 直连。
- 浏览器 **不要**带 `Authorization` Bearer；身份校验放在 **Nginx**（如 `auth_basic`、IP 白名单等）。

**Body（JSON）**

```json
{
  "accounts": [
    { "code": "2530090187", "loginid": "59263" }
  ]
}
```

- `accounts`：至少 1 条、最多 32 条；`code` 为 10～15 位数字学号；`loginid` 为数字（可省略，省略则删除对应 `LOGINID_` 行）。
- 服务端会保留文件中已有的 `PASSWORD_MD5`、`BASE_URL`、`SLOT_IDS` 等键；**要求文件已存在**且至少含 `PASSWORD_MD5`、`BASE_URL`（首次部署请先在服务器创建一份 `accounts.env`）。

**成功**

- HTTP 200，正文 `merged`

**环境变量**

| 变量 | 说明 |
|------|------|
| `SHOWER_ACCOUNTS_ENV_PATH` | 必填，绝对路径 |
| `SHOWER_BIND` | 可选，默认 `127.0.0.1:8765` |
| `SHOWER_REQUIRE_INTERNAL_HEADER` | 可选，默认 `1`；设为 `0` 仅本地调试（不安全） |
| `SHOWER_CONF_SAVE_CORS_ORIGIN` | 可选，跨域时用 |

**前端**

- `index.html`：`<meta name="shower-conf-merge-url" content="/api/merge-accounts-env">`（与 Nginx 路径一致）。留空则隐藏「同步到服务器」按钮。
- 请求使用 `credentials: 'include'`，以便浏览器携带 **Nginx Basic** 等 Cookie/认证（若已配置）。

### 8.2 整文件覆盖（可选）

若设置 **`SHOWER_CONF_WRITE_TOKEN`**，则同时启用：

```text
POST /save
POST /api/save-accounts-env
```

- `Authorization: Bearer <token>`
- `Content-Type: text/plain; charset=utf-8`，正文为完整 `accounts.env`

供脚本或应急使用；日常不必开启。

**示例**：`scripts/nginx-save-conf-snippet.conf`、`scripts/save-accounts-conf.service.example`

## 附：Token 观察结果

当前抓到的 token 形态：

```json
{
  "typ": "JWT",
  "alg": "HS256"
}
```

Payload 中观察到：

```json
{
  "exp": 1786182840752,
  "payload": "{\"id\":59263,\"code\":\"2530090187\",\"password\":\"f1219d2303d63da395244e78b5d5a74d\",\"student\":null}"
}
```

已知特征：

- `loginid` 是纯数字用户 ID
- `token` 是 HS256 的 JWT
- token 中包含 `exp`，看起来会过期
- token payload 内部还嵌入了 `id`、`code`、`password(MD5)`
