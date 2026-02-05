# Doubao API References

Official API docs (Responses API and response object schema):
- https://doubao.apifox.cn/265897481e0
- https://www.volcengine.com/docs/82379/1783703

Notes (from official docs):
- Responses API returns a response object with `output[]` entries.
- Text content is provided under `output[].content[]` where `type` is `output_text` and `text` contains the model reply.
- Non-text outputs (reasoning/tool calls) appear as other `output[].type` values and should be ignored when extracting user-facing text.

## Request/Response Examples

### Request (curl)
```bash
curl --location 'https://ark.cn-beijing.volces.com/api/v3/responses' \
  --header "Authorization: Bearer $ARK_API_KEY" \
  --header 'Content-Type: application/json' \
  --data '{
    "model": "doubao-seed-1-6-250615",
    "input": [
      {
        "role": "user",
        "content": [
          {
            "type": "input_text",
            "text": "你看见了什么？"
          },
          {
            "type": "input_image",
            "image_url": "https://ark-project.tos-cn-beijing.volces.com/doc_image/i2v_foxrgirl.png"
          }
        ]
      }
    ],
    "thinking": {"type": "enabled"}
  }'
```

### Response (sample)
```json
{
  "created_at": 1754571504,
  "id": "resp_0217******",
  "max_output_tokens": 32768,
  "model": "doubao-seed-1-6-250615",
  "object": "response",
  "output": [
    {
      "id": "rs_0217******",
      "type": "reasoning",
      "summary": [
        {
          "type": "summary_text",
          "text": "用户现在需要描述这张图片的内容。首先看图片里的元素：一个红发女孩，有雀斑，穿着白色衣服，和一只红狐亲密接触。狐狸的毛色是红棕、白色，耳朵黑尖，眼睛琥珀色。背景是模糊的草地，色调温暖柔和，氛围宁静亲密。\n\n先整理细节：女孩的红发、雀斑、闭眼的温柔表情，穿着浅色（米白或白色）的衣服，可能是宽松的袖子。狐狸的特征：红棕色皮毛，白色的脸颊和颈部，黑色的耳朵尖端，黄色带黑瞳的眼睛，黑色的鼻子和爪子（能看到爪子搭在女孩衣服上）。两者的互动很亲密，女孩的脸靠近狐狸，狐狸的头也挨着她，姿态温馨，背景是自然的野外，草色偏黄褐，模糊处理，突出主体。\n\n然后组织语言，描述画面的主体、互动、细节和氛围。确保清晰传达视觉元素：人物（红发、雀斑、白衣）、动物（红狐的外观）、互动（亲密依偎）、背景（草地朦胧）、整体氛围（温暖、和谐、宁静）。\n\n现在开始描述：\n\n这张图片展现了一位红发女孩与一只红狐亲密依偎的温馨场景。女孩有着浓密的红棕色长发，脸上点缀着雀斑，身着一件轻柔的白色（或米白色）衣衫，双眼轻闭，神情温柔恬静，似乎正享受与狐狸相伴的时刻。她的脸颊亲昵地挨着狐狸的头部，姿态充满信赖与温情。\n\n身旁的红狐毛色鲜亮，主体为红棕色，脸部、颈部及胸前覆盖着蓬松的白色绒毛，耳朵尖端呈黑色，耳内侧则是浅棕与黑色相间的纹理。狐狸的眼睛呈琥珀色，明亮而有神，黑色的鼻尖与搭在女孩衣袖上的黑色爪子（可见部分），更添其灵动与真实感。它的头部微微转向一侧，却与女孩的脸紧密相靠，仿佛在回应这份亲密。\n\n背景是一片朦胧的自然草地，枯黄与绿意交织的草植在柔和的光线下显得静谧悠远，模糊的处理让焦点完全落在女孩与狐狸的互动上，整体氛围温暖和谐，传递出人与动物间信任、亲昵的美好瞬间，画面色调柔和，充满诗意与治愈感。\n\n检查是否涵盖了主要元素：人物特征（红发、雀斑、白衣、闭眼）、狐狸特征（毛色、耳朵、眼睛、爪子）、互动（亲密依偎）、背景（草地朦胧）、氛围（温馨和谐）。这样应该能清晰描述出图片内容。"
        }
      ],
      "status": "completed"
    },
    {
      "type": "message",
      "role": "assistant",
      "content": [
        {
          "type": "output_text",
          "text": "这张图片呈现了**一位红发女孩与一只红狐亲密依偎**的温馨场景，氛围柔和治愈：  \n\n### 人物与动物细节：  \n- **女孩**：有着浓密蓬松的**红棕色长发**（色泽与狐狸皮毛呼应），脸上点缀着浅褐色雀斑，身着**轻柔的白色（或米白色）衣衫**（衣料褶皱自然，显柔和质感）。她双眼轻闭，神情恬静温柔，脸颊亲昵地贴靠狐狸头部，姿态满是信赖与温情。  \n- **红狐**：毛色鲜亮且层次丰富——主体为暖调红棕色，脸部、颈部及胸前覆盖**蓬松的白色绒毛**，耳朵尖端呈**黑色**，耳内侧是浅棕与黑色相间的细腻纹理；眼睛是**琥珀色（或金黄带黑瞳）**，明亮有神，黑色鼻尖与搭在女孩衣袖上的**黑色爪子**（可见部分），让它更显灵动真实。狐狸头部微微侧转，却与女孩脸紧密相靠，似在回应这份亲昵。  \n\n\n### 场景与氛围：  \n背景是**朦胧的自然草地**（枯黄与绿意交织的草植，因虚化处理更显悠远静谧），柔和的光线（偏暖调）笼罩画面，焦点完全落在人与狐的亲密互动上。整体氛围**温暖、和谐、治愈**，传递出人与动物间信任亲昵的美好瞬间，仿佛时间在此刻静止。  \n\n\n画面通过色彩呼应（女孩红发与狐狸皮毛）、姿态互动（依偎贴靠），构建出诗意且宁静的“共生感”，细节（雀斑、狐的爪/耳纹理）让场景更具真实与感染力。"
        }
      ],
      "status": "completed",
      "id": "msg_0217******"
    }
  ],
  "thinking": {
    "type": "enabled"
  },
  "service_tier": "default",
  "status": "completed",
  "usage": {
    "input_tokens": 1377,
    "output_tokens": 910,
    "total_tokens": 2287,
    "input_tokens_details": {
      "cached_tokens": 0
    },
    "output_tokens_details": {
      "reasoning_tokens": 552
    }
  },
  "caching": {
    "type": "disabled"
  },
  "store": true,
  "expire_at": 1754830704
}
```
