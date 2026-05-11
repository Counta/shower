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
