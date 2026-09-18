/**
 * 核心数据查询逻辑（移植自 item-inspector）
 * 复现 ec-website-nb ItemController.php + 前端 JS 的完整价格取价链路
 *
 * 价格链路说明：
 *   1. PHP 首屏：getItemInfoAllV3 → 取全国价格（region_id 为空时）
 *   2. 前端 JS：读取用户 zipcode → 调 getItemInfoV2?region_id=xxx → 取区域价格覆盖展示价
 *   3. 区域价 rule_id 由 zipcode 查 xysc_shop_district_zipcode 得到
 */

const mysql = require('mysql2/promise');
const { redisHGetAll, redisGet } = require('./redis-client');

// ─── MySQL 连接池缓存 ─────────────────────────────────────────────
const _pools = {};

function getPool(mysqlCfg) {
  const key = mysqlCfg.host;
  if (!_pools[key]) {
    _pools[key] = mysql.createPool({
      host: mysqlCfg.host,
      port: mysqlCfg.port,
      user: mysqlCfg.user,
      password: mysqlCfg.password,
      ssl: mysqlCfg.ssl,
      connectionLimit: 5,
      connectTimeout: 10000,
    });
  }
  return _pools[key];
}

// ─── PDP 价格计算（复现前端 JS + PHP 双层逻辑）──────────────────────
/**
 * 对应后端 ItemQueryService.java 中的完整价格处理流程：
 *
 * 1. setAreaPrice()  —— 用区域价格行覆盖全国字段（unit/promo/seckill/member/giftcard）
 *                       同时用 validPromotion / invalidSeckill / validGiftcardPromo 做时间校验
 * 2. 促销时间校验   —— promote_start_date <= now <= promote_end_date 且 promotion_price > 0
 *                       否则 is_promotion 重置为 N
 * 3. setSeckillPrice()—— 从 seckill_info.rulePrices 中按 rule_id 优先级覆盖 seckill_price
 *                        (本工具直接从 DB 区域行取，等效于 rulePrices 里的静态价)
 * 4. seckill_status 校验 —— seckill_status=2 时校验时间是否在区间，否则清零
 * 5. 秒杀在进行中时清除会员价
 *
 * 对应前端 JS（item.goods/index.js queryItemInfo）：
 *   - is_promotion=Y → item_type=2
 *   - seckill_status 非0/4 且 status!=D → item_type=3（预热+促销时回退为2）
 *   - item_type=2 取 promotion_price；item_type=3 且 status=2/3 取 seckill_price；否则 unit_price
 *   - PHP ItemController::index 额外规则：促销剩余 >72h → item_type 降为1（直降价）
 *
 * @param {object} item      im_item 行（含 im_item_extend.share_inventory）
 * @param {object} price     im_item_price_setting 行（全国价，platform_code=B2C, channel_code=Computer）
 * @param {number} totalAvailableQty
 * @param {object|null} areaRow   命中的区域价格行（im_item_area_price_setting），null 表示取全国
 * @param {boolean} zipcodeProvided 是否传入了 zipcode（用于双仓商品的仓库覆盖范围判断）
 */
function calcPdpInfo(item, price, totalAvailableQty, areaRow, zipcodeProvided) {
  const now = Math.floor(Date.now() / 1000);

  // ── Step 1: setAreaPrice —— 区域覆盖全国字段（对应 Java setAreaPrice()）
  // 区域行存在时按后端逻辑逐字段覆盖，并对各类型价格做时间有效性校验
  let effectivePrice = { ...price };

  if (areaRow) {
    // 基础价格覆盖
    if (areaRow.unit_price   != null) effectivePrice.unit_price   = areaRow.unit_price;
    if (areaRow.market_price != null) effectivePrice.market_price = areaRow.market_price;
    if (areaRow.limit_quantity != null) effectivePrice.limit_quantity = areaRow.limit_quantity;

    // ── 区域促销价 validPromotion() 校验 ──
    // 条件：is_promotion=Y AND promote_start<=now<=promote_end AND promotion_price>0
    const areaPromoValid = areaRow.is_promotion === 'Y'
      && areaRow.promote_start_date != null && areaRow.promote_end_date != null
      && areaRow.promote_start_date <= now && areaRow.promote_end_date > now
      && Number(areaRow.promotion_price) > 0;

    effectivePrice.is_promotion    = areaPromoValid ? 'Y' : 'N';
    effectivePrice.promotion_price = areaRow.promotion_price   ?? price.promotion_price;
    effectivePrice.promote_start_date = areaRow.promote_start_date ?? price.promote_start_date;
    effectivePrice.promote_end_date   = areaRow.promote_end_date   ?? price.promote_end_date;

    // ── 区域秒杀价 invalidSeckill() 校验 ──
    // 后端：seckill_status=2 时，若 start>now 或 end<now → 清零
    // 注意：status 非0/4 都会赋给 item_info，时间校验后再决定是否清零
    const areaSk = areaRow.seckill_status;
    const areaSkTimeInvalid = areaSk === 2
      && (areaRow.seckill_start_time > now || areaRow.seckill_end_time < now);
    const finalAreaSk = areaSkTimeInvalid ? 0 : (areaSk ?? 0);

    effectivePrice.seckill_status    = finalAreaSk;
    effectivePrice.seckill_price     = areaRow.seckill_price     ?? price.seckill_price;
    effectivePrice.seckill_start_time = areaRow.seckill_start_time ?? price.seckill_start_time;
    effectivePrice.seckill_end_time   = areaRow.seckill_end_time   ?? price.seckill_end_time;

    // ── 区域礼卡价 validGiftcardPromo() 校验 ──
    const areaGiftValid = areaRow.giftcard_status === 1
      && areaRow.giftcard_start_time != null && areaRow.giftcard_end_time != null
      && areaRow.giftcard_start_time <= now && areaRow.giftcard_end_time > now
      && Number(areaRow.giftcard_price) > 0;

    effectivePrice.giftcard_status    = areaGiftValid ? 1 : 0;
    effectivePrice.giftcard_price     = areaRow.giftcard_price     ?? price.giftcard_price;
    effectivePrice.giftcard_start_time = areaRow.giftcard_start_time ?? price.giftcard_start_time;
    effectivePrice.giftcard_end_time   = areaRow.giftcard_end_time   ?? price.giftcard_end_time;

    // ── 区域会员价 validMemberPrice() 校验 ──
    // member_status=1 AND start<=now<=end
    const areaMemberValid = areaRow.member_status === 1
      && areaRow.member_start_time != null && areaRow.member_end_time != null
      && areaRow.member_start_time <= now && areaRow.member_end_time > now;

    effectivePrice.member_status     = areaRow.member_status    ?? price.member_status;
    effectivePrice.member_price      = areaMemberValid ? (areaRow.member_price ?? price.member_price) : null;
    effectivePrice.member_start_time = areaRow.member_start_time ?? price.member_start_time;
    effectivePrice.member_end_time   = areaRow.member_end_time   ?? price.member_end_time;
  } else {
    // ── 全国价同样做促销时间校验（对应 getItemInfoV2 中的 promote 状态检测）──
    const globalPromoValid = price.is_promotion === 'Y'
      && price.promote_start_date != null && price.promote_end_date != null
      && price.promote_start_date <= now && price.promote_end_date > now
      && Number(price.promotion_price) > 0;
    if (!globalPromoValid) effectivePrice.is_promotion = 'N';

    // 全国秒杀 invalidSeckill 校验
    const globalSk = price.seckill_status;
    const globalSkTimeInvalid = globalSk === 2
      && (price.seckill_start_time > now || price.seckill_end_time < now);
    if (globalSkTimeInvalid) effectivePrice.seckill_status = 0;
  }

  const ep = effectivePrice;

  // ── Step 2: 秒杀进行中清除会员价（对应后端 seckill_status==2 时 setMemberPrice(null)）──
  const seckillStatus = ep.seckill_status;
  if (seckillStatus === 2) {
    ep.member_price = null;
  }

  // ── Step 3: 确定 item_type（对应前端 JS queryItemInfo() + PHP ItemController::index()）──
  let itemType = 1;

  // 促销（时间校验已在 effectivePrice 里做了，is_promotion=Y 即表示生效中）
  if (ep.is_promotion === 'Y') itemType = 2;

  // 秒杀：非0/4 且商品未下架
  // RP-6524：秒杀进行中+促销时，秒杀预热(1)+促销 → 按促销；status=D → 不算秒杀
  if (seckillStatus != null && seckillStatus !== 0 && seckillStatus !== 4 && item.status !== 'D') {
    itemType = 3;
    if (seckillStatus === 1 && ep.is_promotion === 'Y') itemType = 2; // 预热中+促销 → 促销
  }

  // 下架 / 删除
  if (item.status === 'D' || item.status === 'R') itemType = 5;

  // 促销 >72h 降级为普通（PHP ItemController::index 独有规则）
  const promoOver72h = itemType === 2 && ep.promote_end_date && (ep.promote_end_date - now) > 3 * 24 * 3600;
  if (promoOver72h) itemType = 1;

  // ── Step 4: 确定展示价格 ──
  let pdpPrice = null;
  let pdpPriceSource = 'unit_price';

  if (itemType === 2) {
    pdpPrice = ep.promotion_price;
    pdpPriceSource = 'promotion_price';
  } else if (itemType === 3 && (seckillStatus === 2 || seckillStatus === 3)) {
    pdpPrice = ep.seckill_price;
    pdpPriceSource = 'seckill_price';
  } else {
    pdpPrice = ep.unit_price;
    pdpPriceSource = 'unit_price';
  }

  // ── 可售判断 ──
  const inStock = totalAvailableQty > 0;
  const isListed = item.status === 'A';
  // 双仓（非共享库存）商品：库存按仓库拆分，若传入的 zipcode 不在该商品任何一个仓库覆盖区域
  // （即在 im_item_area_price_setting 里配置了区域价的 rule_id）内，说明没有仓库能配送到这个
  // 地址，此时不管全部仓库加总库存多少都应判定不可售（对应 share_inventory=0 时后端按仓库覆盖
  // 范围过滤可配送仓库的逻辑）。share_inventory=1（共享库存）的商品不受此限制。
  const noWarehouseCoverage = zipcodeProvided && !areaRow && item.share_inventory === 0;
  const isSalable = isListed && inStock && !noWarehouseCoverage;
  let unsalableReason = null;
  if (!isListed) unsalableReason = `商品状态: ${item.status}（非上架）`;
  else if (noWarehouseCoverage) unsalableReason = `该 zipcode 不在此商品任何仓库覆盖范围内（双仓商品 share_inventory=0，非共享库存，无仓库可配送到该地址）`;
  else if (!inStock) unsalableReason = `库存不足（available_qty=0）`;

  // 会员价生效判断（已在 effectivePrice 里做了时间校验，直接看 member_price 是否非空）
  const memberActive = ep.member_status === 1
    && ep.member_price != null && Number(ep.member_price) > 0
    && ep.member_start_time && ep.member_end_time
    && now >= ep.member_start_time && now <= ep.member_end_time
    && seckillStatus !== 2; // 秒杀进行中时无会员价

  // 促销生效：is_promotion=Y 且 itemType 最终为2（未被72h降级）
  const promoActive = ep.is_promotion === 'Y' && itemType === 2;

  // 礼卡生效
  const giftcardActive = ep.giftcard_status === 1
    && ep.giftcard_price != null && Number(ep.giftcard_price) > 0;

  return {
    item_type: itemType,
    item_type_label: { 1: '普通', 2: '促销', 3: '秒杀', 4: '赠品', 5: '下架', 6: '拼团', 7: '电子礼卡' }[itemType] || '未知',
    pdp_price: pdpPrice != null ? Number(pdpPrice).toFixed(2) : null,
    pdp_price_source: pdpPriceSource,
    // 区域信息
    area_rule_id:   areaRow ? areaRow.rule_id   : null,
    area_rule_name: areaRow ? areaRow.rule_name  : null,
    area_used: !!areaRow,
    // 状态
    is_salable: isSalable,
    unsalable_reason: unsalableReason,
    seckill_active: seckillStatus === 2,
    promo_active: promoActive,
    promo_over_72h: promoOver72h,
    member_active: memberActive,
    giftcard_active: giftcardActive,
    member_price_display: memberActive ? Number(ep.member_price).toFixed(2) : null,
    giftcard_price_display: giftcardActive ? Number(ep.giftcard_price).toFixed(2) : null,
    // 把最终生效的价格行透传出来，供前端推导链展示（已完成时间校验）
    effective_price: {
      unit_price:        ep.unit_price,
      market_price:      ep.market_price,
      is_promotion:      ep.is_promotion,
      promotion_price:   ep.promotion_price,
      promote_start_date: ep.promote_start_date,
      promote_end_date:   ep.promote_end_date,
      seckill_status:    ep.seckill_status,
      seckill_price:     ep.seckill_price,
      seckill_start_time: ep.seckill_start_time,
      seckill_end_time:   ep.seckill_end_time,
      member_status:     ep.member_status,
      member_price:      ep.member_price,
      member_start_time: ep.member_start_time,
      member_end_time:   ep.member_end_time,
      giftcard_status:   ep.giftcard_status,
      giftcard_price:    ep.giftcard_price,
      giftcard_start_time: ep.giftcard_start_time,
      giftcard_end_time:   ep.giftcard_end_time,
      limit_quantity:    ep.limit_quantity,
    },
  };
}

// ─── 商品基础信息查询 ─────────────────────────────────────────────
/**
 * @param {object} mysqlCfg
 * @param {string} itemNumber
 * @param {string} [zipcode]  可选，传入 zipcode 时模拟前端 JS 的区域价格覆盖
 * @param {string} [siteCode] 站点编码（us/ca），item_number 理论上可能在不同站点重复使用，默认 us
 */
async function queryItemBasicInfo(mysqlCfg, itemNumber, zipcode, siteCode) {
  const pool = getPool(mysqlCfg);
  const site = siteCode || 'us';

  // 1. 商品基础（im_item + im_item_extend）
  const [itemRows] = await pool.query(
    `SELECT
       i.goods_id,
       i.item_number,
       i.status,
       i.market_price,
       i.brand_id,
       i.seller_id,
       i.site_code,
       i.category_id,
       ext.share_inventory
     FROM Yamibuy_IM.im_item i
     LEFT JOIN Yamibuy_IM.im_item_extend ext ON ext.item_number = i.item_number
     WHERE i.item_number = ? AND i.site_code = ?`,
    [itemNumber, site]
  );
  if (!itemRows.length) return { error: `商品 ${itemNumber} 在 ${site} 站点不存在` };
  const item = itemRows[0];

  // 2. 中文标题
  const [descRows] = await pool.query(
    `SELECT title AS item_title
     FROM Yamibuy_IM.im_item_short_description
     WHERE item_number = ? AND language_id = 'zh_CN'
     LIMIT 1`,
    [itemNumber]
  );
  const itemTitle = descRows.length ? descRows[0].item_title : '';

  // 3. 全国价格（im_item_price_setting）
  const [priceRows] = await pool.query(
    `SELECT
       unit_price, is_promotion, promotion_price, promote_start_date, promote_end_date,
       seckill_status, seckill_price, seckill_start_time, seckill_end_time,
       member_status, member_price, member_start_time, member_end_time,
       giftcard_status, giftcard_price, giftcard_start_time, giftcard_end_time,
       limit_quantity
     FROM Yamibuy_IM.im_item_price_setting
     WHERE item_number = ? AND platform_code = 'B2C' AND channel_code = 'Computer'
     LIMIT 1`,
    [itemNumber]
  );
  const price = priceRows.length ? priceRows[0] : {};

  // 4. 区域价格列表（全部 rule_id）
  const [localPriceRows] = await pool.query(
    `SELECT
       pset.rule_id,
       rule.rule_name,
       pset.market_price,
       pset.unit_price,
       pset.is_promotion,
       pset.promotion_price,
       pset.promote_start_date,
       pset.promote_end_date,
       pset.seckill_status,
       pset.seckill_price,
       pset.seckill_start_time,
       pset.seckill_end_time,
       pset.member_status,
       pset.member_price,
       pset.giftcard_status,
       pset.giftcard_price,
       pset.limit_quantity
     FROM Yamibuy_IM.im_item_area_price_setting pset
     LEFT JOIN Yamibuy_Master.xysc_shop_district_rule rule
       ON rule.rule_id = pset.rule_id AND rule.status = 1
     WHERE pset.item_number = ?
     ORDER BY pset.rule_id`,
    [itemNumber]
  );

  // 5. zipcode → rule_id
  // 注意：一个 zipcode 往往同时命中几十个 xysc_shop_district_zipcode 规则（销售范围/配送范围/
  // 各种测试区域等互不相关的规则都可能覆盖同一个 zipcode），不能不加过滤地 LIMIT 1 随便取一个，
  // 否则会命中跟当前商品毫无关系的规则，导致明明有区域促销价却被判定为"无区域覆盖"。
  // 真正有意义的只有该商品自己配置了区域价的那些 rule_id，所以直接把候选范围限定在
  // im_item_area_price_setting 已有的 rule_id 集合内再去匹配 zipcode。
  let zipcodeRuleId = null;
  let zipcodeRuleName = null;
  let zipcodeNotFound = false;
  if (zipcode && localPriceRows.length) {
    try {
      const candidateRuleIds = localPriceRows.map(r => r.rule_id);
      const [zcRows] = await pool.query(
        `SELECT z.rule_id, r.rule_name
         FROM Yamibuy_Master.xysc_shop_district_zipcode z
         LEFT JOIN Yamibuy_Master.xysc_shop_district_rule r ON r.rule_id = z.rule_id AND r.status = 1
         WHERE z.zipcode = ? AND z.rule_id IN (?)
         LIMIT 1`,
        [zipcode.toString(), candidateRuleIds]
      );
      if (zcRows.length) {
        zipcodeRuleId   = zcRows[0].rule_id;
        zipcodeRuleName = zcRows[0].rule_name;
      } else {
        zipcodeNotFound = true;
      }
    } catch (e) {
      // 查不到 zipcode 表时忽略
      zipcodeNotFound = true;
    }
  } else if (zipcode) {
    // 商品本身没有任何区域价配置，直接判定为无区域覆盖
    zipcodeNotFound = true;
  }

  // 6. 命中的区域价格行
  let areaRow = null;
  if (zipcodeRuleId != null) {
    areaRow = localPriceRows.find(r => r.rule_id == zipcodeRuleId) || null;
  }

  // 7. 库存
  let inventoryRows = [];
  try {
    const [rows] = await pool.query(
      `SELECT warehouse_number, available_qty, reserved_qty, accounting_qty, order_qty
       FROM Yamibuy_Inventory.inventory_transaction
       WHERE item_number = ?`,
      [itemNumber]
    );
    inventoryRows = rows;
  } catch (e) {
    inventoryRows = [{ error: e.message }];
  }

  let totalAvailableQty = 0, totalReservedQty = 0;
  if (inventoryRows.length && !inventoryRows[0].error) {
    for (const r of inventoryRows) {
      totalAvailableQty += (r.available_qty || 0);
      totalReservedQty  += (r.reserved_qty  || 0);
    }
  }

  // 8. PDP 计算（区域优先）
  const pdpInfo = calcPdpInfo(item, price, totalAvailableQty, areaRow, !!zipcode);

  return {
    goods_id:   item.goods_id,
    item_number: itemNumber,
    item_title:  itemTitle,
    status:      item.status,
    seller_id:   item.seller_id,
    site_code:   item.site_code,
    share_inventory: item.share_inventory,
    // zipcode 查找结果
    zipcode_query: zipcode ? {
      zipcode,
      rule_id:    zipcodeRuleId,
      rule_name:  zipcodeRuleName,
      not_found:  zipcodeNotFound,
      area_price_found: !!areaRow,
    } : null,
    // 全国价格原始值
    db_price: {
      market_price:       item.market_price,
      unit_price:         price.unit_price,
      is_promotion:       price.is_promotion,
      promotion_price:    price.promotion_price,
      promote_start_date: price.promote_start_date,
      promote_end_date:   price.promote_end_date,
      seckill_status:     price.seckill_status,
      seckill_price:      price.seckill_price,
      seckill_start_time: price.seckill_start_time,
      seckill_end_time:   price.seckill_end_time,
      member_status:      price.member_status,
      member_price:       price.member_price,
      member_start_time:  price.member_start_time,
      member_end_time:    price.member_end_time,
      giftcard_status:    price.giftcard_status,
      giftcard_price:     price.giftcard_price,
      giftcard_start_time: price.giftcard_start_time,
      giftcard_end_time:  price.giftcard_end_time,
      limit_quantity:     price.limit_quantity,
    },
    // PDP 结论（已考虑区域覆盖）
    pdp: pdpInfo,
    // 区域价格列表
    local_prices: localPriceRows,
    // 库存
    inventory: {
      total_available_qty: totalAvailableQty,
      total_reserved_qty:  totalReservedQty,
      by_warehouse: inventoryRows,
    },
  };
}

// ─── Redis 价格缓存查询 ────────────────────────────────────────────
async function queryRedisPriceCache(redisCfg, itemNumber) {
  const EC_ITEM_REDIS_URL = 'ec-item.redis.yamibuy.net:6380';
  try {
    const allFields = await redisHGetAll(redisCfg, EC_ITEM_REDIS_URL, `promotion:price:${itemNumber}`);
    return allFields;
  } catch (e) {
    return { error: e.message };
  }
}

async function queryRedisItemCache(redisCfg, itemNumber) {
  const EC_ITEM_REDIS_URL = 'ec-item.redis.yamibuy.net:6380';
  try {
    const val = await redisGet(redisCfg, EC_ITEM_REDIS_URL, `IM_ITEMS:${itemNumber}:zh_CN:B2C:Computer`);
    if (!val) return null;
    try { return JSON.parse(val); } catch { return val; }
  } catch (e) {
    return { error: e.message };
  }
}

module.exports = { queryItemBasicInfo, queryRedisPriceCache, queryRedisItemCache };
