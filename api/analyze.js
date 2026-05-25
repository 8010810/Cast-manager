export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { messages, type, castData, customerData, salesData, storeData } = req.body;

    let systemPrompt = '';

    if (type === 'store-sales') {

      const sd = salesData || {};
      const dow = ['日','月','火','水','木','金','土'];

      const dowBlock = (sd.byDayOfWeek || []).map(d =>
        '・' + dow[d.day] + '曜：平均売上¥' + (d.avgSales||0).toLocaleString()
        + ' / 平均客数' + (d.avgGuests||0) + '人'
        + ' / 目標シフト' + d.quota + '人 実績' + (d.avgShifts||0) + '人'
        + '（' + d.count + '日分）'
      ).join('\n');

      const weekBlock = (sd.recentWeeks || []).map(w =>
        '・' + w.week + '：売上¥' + (w.sales||0).toLocaleString() + ' / 客数' + (w.guests||0) + '人'
      ).join('\n');

      const castBlock = (sd.casts || []).map(c => {
        const pct = c.achieveRate !== null ? c.achieveRate + '%' : '-';
        const mom = c.lastMonthSales ? Math.round(c.sales / c.lastMonthSales * 100) + '%' : '-';
        return '・' + c.name + (c.isDispatch ? '（派遣）' : '')
          + '：¥' + (c.sales||0).toLocaleString()
          + (c.target ? '（目標¥' + c.target.toLocaleString() + ' / 達成率' + pct + '）' : '')
          + ' 出勤' + c.workDays + '日'
          + ' 1出勤¥' + (c.salesPerDay||0).toLocaleString()
          + ' 指名' + c.nominations + '組 同伴' + c.companions + '回'
          + (c.lastMonthSales ? ' 前月比' + mom : '');
      }).join('\n');

      const dataBlock = [
        '【店舗売上データ】',
        '対象期間：' + (sd.yearMonth || ''),
        '月間売上：¥' + (sd.totalSales||0).toLocaleString(),
        sd.lastMonthSales ? '前月売上：¥' + sd.lastMonthSales.toLocaleString() : null,
        sd.momRate    ? '前月比：' + sd.momRate + '%' : null,
        '営業日数：' + (sd.workingDays||0) + '日',
        '月間客数：' + (sd.totalGuests||0) + '人',
        '月間同伴数：' + (sd.totalCompanions||0) + '回',
        '月間指名組数：' + (sd.totalNominations||0) + '組',
        '月間場内組数：' + (sd.totalFloorCount||0) + '組',
        '日平均売上：¥' + (sd.avgSalesPerDay||0).toLocaleString(),
        '客単価（AVG）：¥' + (sd.avgPerGuest||0).toLocaleString(),
        '',
        '【曜日別パフォーマンス】',
        dowBlock,
        '',
        '【週次推移（直近）】',
        weekBlock,
        '',
        '【キャスト別今月実績（売上順）】',
        castBlock || '　データなし'
      ].filter(Boolean).join('\n');

      systemPrompt = [
        'あなたはキャバクラ店舗の売上分析を専門とするAIです。',
        '提供された店舗データとキャスト別データをもとに、黒服マネージャーが明日から動ける具体的な分析と提案をしてください。',
        '',
        '【業界知識・前提】',
        '・客数が全ての根本。客が入らない店に売上は伸びない',
        '・週末（特に金曜）は最も攻める日。休み前日が最も集客しやすい',
        '・守りに入ると売上は確実に落ちる。常に攻める姿勢を基本とする',
        '・曜日別の強弱は店舗によって異なる。データから実態を読む',
        '・AVGが低い日は客数が多くても利益構造が弱い可能性がある',
        '・シフト過多の日はコスト圧迫、不足の日は機会損失の可能性がある',
        '・今月の状況を見ながら来月の準備も同時に考える',
        '',
        '【分析の視点】',
        '■ 月間進捗',
        '  前月比・営業日数あたりの効率・残り営業日での目標達成見込みを評価する',
        '',
        '■ 曜日別パターン',
        '  強い曜日・弱い曜日を特定し、quota（目標シフト）と実績の乖離を確認する',
        '  シフトが少ない割に売上が高い曜日 → 増員で伸びる可能性',
        '  シフトが多い割に売上が低い曜日 → コスト見直しが必要',
        '',
        '■ 客数とAVGの関係',
        '  客数↑AVG↓ → 薄い客が多い、単価向上施策が必要',
        '  客数↓AVG↑ → 太客への依存、新規集客が必要',
        '  両方↓ → 集客から立て直しが最優先',
        '',
        '■ 週次トレンド',
        '  上昇・下降・横ばいの判断と、転換点があれば原因を推測する',
        '',
        '■ 今月注力すべきキャスト（最重要）',
        '  目標未達・達成済みにかかわらず、今月あと伸ばせる可能性の高いキャストを最大5名ピックアップする。',
        '  選定基準（複合的に判断）：',
        '  ・目標未達だが1出勤あたり売上が高い → 出勤増やせば即跳ね上がる',
        '  ・目標達成済みでも同伴・指名が多く上限が見えていない → もう一押しで大幅UP',
        '  ・前月比が上昇トレンド → 勢いを止めない声がけが有効',
        '  ・目標未達で出勤も少ない → 出勤促進が最優先',
        '  各キャストに対してマネージャーが明日できる具体的なアクション（声がけ内容・シフト調整・同伴促進など）を1〜2行で示す。',
        '',
        '【判断の原則】',
        '・データが不足している場合は「データ不足」と明記する',
        '・断定を避ける。「〜の可能性があります」「〜を検討してください」で提示する',
        '・短期（今月残り）と中期（来月）を分けてアドバイスする',
        '・数字の羅列ではなく、マネージャーが動けるアクションベースで答える',
        '',
        '【回答フォーマット】',
        '1. 今月の総合評価（2〜3行）',
        '2. 強みと弱みの分析（曜日・客数・AVGの観点で）',
        '3. 注目すべきポイント（異常値・改善のチャンスなど）',
        '4. 今月注力すべきキャスト（名前・理由・具体的アクションをセットで、最大5名）',
        '5. 今月残りでやるべき店舗全体のアクション',
        '6. 来月に向けた準備',
        '',
        'iPadで読みやすい長さにする。',
        '最後に「最終判断はマネージャーが行ってください」を添える。',
        '',
        dataBlock
      ].join('\n');

    } else if (type === 'ai-trends') {

      const td = trendsData || {};
      const profiles = td.castProfiles || [];

      const typeGroups = {};
      profiles.forEach(p => {
        const t = p.castType || '未設定';
        if (!typeGroups[t]) typeGroups[t] = { count:0, totalSales:0, totalNoms:0 };
        typeGroups[t].count++;
        typeGroups[t].totalSales += p.avgMonthlySales;
        typeGroups[t].totalNoms += p.avgNominations;
      });
      const typeBlock = Object.keys(typeGroups).map(t => {
        const g = typeGroups[t];
        return '・' + t + '：' + g.count + '名'
          + ' / 平均月売上¥' + Math.round(g.totalSales/g.count).toLocaleString()
          + ' / 平均月指名' + Math.round(g.totalNoms/g.count) + '組';
      }).join('\n');

      const ageGroups = {'18-20':{count:0,sales:0},'21-23':{count:0,sales:0},'24-26':{count:0,sales:0},'27-29':{count:0,sales:0},'30+':{count:0,sales:0}};
      profiles.forEach(p => {
        if (p.age === null) return;
        const age = p.age;
        const g = age<=20?'18-20':age<=23?'21-23':age<=26?'24-26':age<=29?'27-29':'30+';
        ageGroups[g].count++; ageGroups[g].sales += p.avgMonthlySales;
      });
      const ageBlock = Object.keys(ageGroups)
        .filter(k => ageGroups[k].count > 0)
        .map(k => {
          const g = ageGroups[k];
          return '・' + k + '歳：' + g.count + '名'
            + ' / 平均月売上¥' + Math.round(g.sales/g.count).toLocaleString();
        }).join('\n');

      const heightGroups = {'-155':{count:0,sales:0},'156-160':{count:0,sales:0},'161-165':{count:0,sales:0},'166-170':{count:0,sales:0},'171+':{count:0,sales:0}};
      profiles.forEach(p => {
        if (!p.height) return;
        const h = p.height;
        const g = h<=155?'-155':h<=160?'156-160':h<=165?'161-165':h<=170?'166-170':'171+';
        heightGroups[g].count++; heightGroups[g].sales += p.avgMonthlySales;
      });
      const heightBlock = Object.keys(heightGroups)
        .filter(k => heightGroups[k].count > 0)
        .map(k => {
          const g = heightGroups[k];
          return '・' + k + 'cm：' + g.count + '名'
            + ' / 平均月売上¥' + Math.round(g.sales/g.count).toLocaleString();
        }).join('\n');

      const cupGroups = {};
      profiles.forEach(p => {
        const c = p.cup || '未設定';
        if (!cupGroups[c]) cupGroups[c] = {count:0,sales:0};
        cupGroups[c].count++; cupGroups[c].sales += p.avgMonthlySales;
      });
      const cupBlock = Object.keys(cupGroups).sort().map(c => {
        const g = cupGroups[c];
        return '・' + (c !== '未設定' ? c + 'カップ' : c) + '：' + g.count + '名'
          + ' / 平均月売上¥' + Math.round(g.sales/g.count).toLocaleString();
      }).join('\n');

      const regular = profiles.filter(p => !p.isDispatch);
      const dispatch = profiles.filter(p => p.isDispatch);

      const dataBlock = [
        '【キャスト在籍状況】',
        '在籍キャスト：' + regular.length + '名',
        '派遣キャスト：' + dispatch.length + '名',
        '集計期間：直近3ヶ月平均',
        '',
        '【系統別分布×実績】',
        typeBlock || 'データなし',
        '',
        '【年齢別分布×実績】',
        ageBlock || 'データなし',
        '',
        '【身長別分布×実績】',
        heightBlock || 'データなし',
        '',
        '【カップ別分布×実績】',
        cupBlock || 'データなし'
      ].join('\n');

      systemPrompt = [
        'あなたはキャバクラの採用戦略を専門とするAIです。',
        '提供された在籍キャストの特性データと実績を分析し、',
        '店舗が次にどんなキャストを採用すべきかを提案してください。',
        '',
        '【分析の視点】',
        '',
        '■ 系統の分析',
        '  castTypeは自由入力のため、似た系統（例：清楚系・清楚など）は同一グループとして解釈する',
        '  特定の系統に偏りすぎていないか確認する',
        '  実績（売上・指名）が高い系統を特定する',
        '',
        '■ 年齢バランス',
        '  若手・中堅・ベテランのバランスを評価する',
        '  特定年齢層に偏っている場合はリスクを指摘する',
        '  実績との相関を読む',
        '',
        '■ 身長・スタイル',
        '  現在の分布を確認し、偏りがあれば指摘する',
        '  実績との相関があれば言及する',
        '',
        '■ ギャップ分析',
        '  現在のラインナップで不足している属性・系統を特定する',
        '  客層のバランス（幅広い客を取り込めているか）を評価する',
        '',
        '【採用提案の原則】',
        '・既存の強みを維持しながら弱点を補う採用を優先する',
        '・1タイプへの集中は長期的リスク（その系統が流行り廃りする）',
        '・実績データに基づいた提案をする',
        '・断定せず「〜の傾向があります」「〜を検討してください」で提示する',
        '・データが少ない属性については「サンプル数が少ないため参考程度に」と明記する',
        '',
        '【回答フォーマット】',
        '1. 現在のキャスト構成の評価（強みと偏り）',
        '2. 実績が高い属性の傾向',
        '3. 不足している・補強すべき属性',
        '4. 次の採用でターゲットにすべきキャスト像（具体的に）',
        '5. 中長期の採用方針',
        '',
        'iPadで読みやすい長さにする。',
        '最後に「最終判断はマネージャーが行ってください」を添える。',
        '',
        dataBlock
      ].join('\n');

    } else if (type === 'store-shift') {

      const sd2 = storeData || {};
      const dow = ['日','月','火','水','木','金','土'];
      const dowBlock = (sd2.byDayOfWeek || []).map(d =>
        '・' + dow[d.day] + '曜：目標' + d.quota + '人 実績' + d.avgShifts + '人'
        + '（乖離' + (d.avgShifts - d.quota > 0 ? '+' : '') + (d.avgShifts - d.quota).toFixed(1) + '人）'
        + ' 平均売上¥' + (d.avgSales||0).toLocaleString()
        + '（' + d.count + '日分）'
      ).join('\n');
      const castBlock2 = (sd2.casts || []).map(c =>
        '・' + c.name + '：契約' + (c.contractShift||'-') + ' / 今月出勤' + c.workDays + '日'
        + (c.contractShift ? '（達成率' + Math.round(c.workDays / c.contractShift * 100) + '%）' : '')
      ).join('\n');

      systemPrompt = [
        'あなたはキャバクラ店舗のシフト管理を専門とするAIです。',
        '提供されたシフトデータをもとに、マネージャーが実行できるシフト最適化の提案をしてください。',
        '',
        '【分析の視点】',
        '・quota（目標シフト人数）と実績の乖離が大きい曜日を特定する',
        '・不足曜日 → 誰を追加投入すべきか、同伴・早上がりを活用できないか',
        '・過剰曜日 → コスト圧迫のリスク、出勤調整の余地',
        '・売上が低いのにシフトが多い曜日は構造的な問題の可能性',
        '・キャストの契約シフトに対する達成率も評価する',
        '',
        '【判断の原則】',
        '・断定しない。「〜の可能性があります」「〜を検討してください」で提示する',
        '・短期（今月残り）と中期（来月）を分けてアドバイスする',
        '',
        '【回答フォーマット】',
        '1. シフト全体評価（2〜3行）',
        '2. 要改善曜日と理由',
        '3. キャスト別の出勤状況で気になる点',
        '4. 来月のシフト編成への提案',
        '',
        'iPadで読みやすい長さにする。',
        '最後に「最終判断はマネージャーが行ってください」を添える。',
        '',
        '【曜日別シフトデータ】',
        '対象期間：' + (sd2.yearMonth || ''),
        dowBlock,
        '',
        '【キャスト別出勤状況】',
        castBlock2
      ].join('\n');

    } else if (type === 'store-attendance') {

      const ad = storeData || {};
      const castBlock3 = (ad.casts || []).map(c => {
        const rate = c.contractShift > 0 ? Math.round(c.workDays / c.contractShift * 100) : null;
        return '・' + c.name + '：契約' + (c.contractShift||'-') + '日 / 実績' + c.workDays + '日'
          + (rate !== null ? '（達成率' + rate + '%）' : '')
          + (c.isDispatch ? '（派遣）' : '');
      }).join('\n');

      systemPrompt = [
        'あなたはキャバクラ店舗の勤怠管理を専門とするAIです。',
        '提供されたキャスト別の勤怠データをもとに、改善が必要なポイントと具体的なアクションを提案してください。',
        '',
        '【分析の視点】',
        '・契約シフトに対して出勤日数が少ないキャストは要フォロー',
        '・達成率が低い原因（体調・モチベ・プライベート）を想定しアドバイスに反映する',
        '・逆に達成率が高いキャストへの感謝・維持施策も重要',
        '・出勤不安定なキャストは売上も不安定になりやすい',
        '',
        '【判断の原則】',
        '・断定しない。「〜の可能性があります」「〜を検討してください」で提示する',
        '・勤怠の問題は個別に丁寧に対応する必要がある点を考慮する',
        '',
        '【回答フォーマット】',
        '1. 全体の勤怠評価（2〜3行）',
        '2. 要フォローキャスト（名前と理由）',
        '3. 各キャストへの声がけ・対応提案',
        '4. 来月に向けた勤怠改善アクション',
        '',
        'iPadで読みやすい長さにする。',
        '最後に「最終判断はマネージャーが行ってください」を添える。',
        '',
        '【キャスト別勤怠データ】',
        '対象期間：' + (ad.yearMonth || ''),
        castBlock3
      ].join('\n');

    } else if (type === 'store-visits') {

      const vd = storeData || {};
      const upcomingBlock = (vd.upcoming || []).length > 0
        ? (vd.upcoming || []).map(v =>
            '・' + v.date + ' ' + (v.time||'') + ' ' + v.type + '：' + (v.guestName||'') + ' → ' + (v.castName||'担当未定')
            + (v.count ? '（' + v.count + '名）' : '')
          ).join('\n')
        : '　なし';
      const recentBlock = (vd.recent || []).length > 0
        ? (vd.recent || []).map(v =>
            '・' + v.date + ' ' + v.type + '：' + (v.guestName||'') + ' → ' + (v.castName||'')
          ).join('\n')
        : '　なし';

      systemPrompt = [
        'あなたはキャバクラ店舗の来店管理を専門とするAIです。',
        '提供された来店予定・来店実績データをもとに、マネージャーが動ける具体的な提案をしてください。',
        '',
        '【分析の視点】',
        '・直近の来店予定から、当日の準備・担当キャストへの指示を提案する',
        '・同伴予定があるキャストのコンディション確認を促す',
        '・来店頻度が高い顧客へのVIP対応を提案する',
        '・来店が途絶えている顧客の再来店施策（LINEフォロー等）を提案する',
        '',
        '【判断の原則】',
        '・断定しない。「〜の可能性があります」「〜を検討してください」で提示する',
        '・直近の行動につながるアドバイスを優先する',
        '',
        '【回答フォーマット】',
        '1. 来店状況の総評（2〜3行）',
        '2. 直近予定への具体的な準備アドバイス',
        '3. フォローが必要な顧客・キャスト',
        '4. 来店数増加のための施策提案',
        '',
        'iPadで読みやすい長さにする。',
        '最後に「最終判断はマネージャーが行ってください」を添える。',
        '',
        '【来店予定（直近）】',
        upcomingBlock,
        '',
        '【来店実績（直近）】',
        recentBlock
      ].join('\n');

    } else {
      // type === 'cast'（既存ロジック）
      const castBlock = [
        '【分析対象キャストのデータ】',
        'キャスト名：' + castData.name + (castData.isDispatch ? '（派遣）' : ''),
        '対象期間：' + castData.period,
        '月間目標：¥' + (castData.targetSales || 0).toLocaleString(),
        '現在の売上：¥' + (castData.salesTotal || 0).toLocaleString(),
        '達成率：' + (castData.targetSales ? Math.round((castData.salesTotal / castData.targetSales) * 100) : '-') + '%',
        '出勤日数：' + castData.workDays + '日',
        '本指名組数：' + castData.nominationCount + '組',
        '場内指名組数：' + castData.floorNominationCount + '組',
        '同伴数：' + castData.companionCount + '回',
        '1出勤あたり売上：¥' + (castData.workDays > 0 ? Math.round(castData.salesTotal / castData.workDays).toLocaleString() : 0),
        castData.lastMonthSales != null ? '前月売上：¥' + castData.lastMonthSales.toLocaleString() : null,
        castData.lastMonthSales ? '前月比：' + Math.round((castData.salesTotal / castData.lastMonthSales) * 100) + '%' : null
      ].filter(Boolean).join('\n');

      const today = new Date();
      const analyzed = (customerData || []).map(c => {
        const last = new Date(c.lastVisitDate);
        const days = Math.floor((today - last) / 86400000);
        const avg = c.averageVisitInterval || 30;
        const risk = days >= avg * 2 ? '高リスク' : days >= avg * 1.5 ? '要注意' : '良好';
        return { ...c, daysSinceLast: days, risk };
      });
      const highRisk = analyzed.filter(c => c.risk === '高リスク');
      const caution  = analyzed.filter(c => c.risk === '要注意');
      const customerBlock = customerData && customerData.length > 0
        ? [
            '【担当顧客データ】',
            '総顧客数：' + analyzed.length + '名（良好 ' + analyzed.filter(c => c.risk === '良好').length + '名 / 要注意 ' + caution.length + '名 / 高リスク ' + highRisk.length + '名）',
            '',
            '高リスク顧客（離脱の可能性）：',
            highRisk.length > 0
              ? highRisk.map(c => '・' + c.name + '（' + c.nominationType + '）最終来店：' + c.daysSinceLast + '日前 / 平均来店間隔：' + c.averageVisitInterval + '日').join('\n')
              : '　なし',
            '',
            '要注意顧客：',
            caution.length > 0
              ? caution.map(c => '・' + c.name + '（' + c.nominationType + '）最終来店：' + c.daysSinceLast + '日前 / 平均来店間隔：' + c.averageVisitInterval + '日').join('\n')
              : '　なし'
          ].join('\n')
        : '【担当顧客データ】データなし';

      systemPrompt = [
        'あなたはキャバクラの黒服マネージャーを支援するAIです。',
        '提供されたキャスト個人のデータと担当顧客データを分析し、マネージャーが具体的に動けるアドバイスをしてください。',
        '',
        '【分析の視点】',
        '',
        '■ 売上・目標達成率',
        '- 目標に対して現在どのポジションにいるか',
        '- 月の経過日数を考慮した進捗評価（月初と月末では意味が違う）',
        '- 前月比がある場合はトレンドも評価する',
        '',
        '■ 出勤安定性',
        '- 出勤日数の多寡と1出勤あたり売上で効率を判断',
        '- 売上不振の原因が出勤にあるのか接客にあるのかを切り分ける',
        '',
        '■ 指名力',
        '- 本指名数：既存顧客関係の強さ',
        '- 場内指名数：フロアでの接客力',
        '- 本指名が少なく場内が多い → リピートに繋げられていない可能性',
        '- 両方少ない → 接客の改善が必要',
        '',
        '■ 同伴',
        '- 同伴数は顧客との関係値の深さを示す',
        '- 売上はあるが同伴ゼロ → 関係値が浅い客が多い可能性',
        '',
        '■ 顧客ポートフォリオ分析',
        '来店リスクの判定基準：',
        '- 平均来店間隔の2倍以上 → 高リスク',
        '- 平均来店間隔の1.5倍以上 → 要注意',
        '- 直近1ヶ月以内 → 良好',
        '',
        '■ 派遣キャストの場合',
        'isDispatch が true の場合、長期的な本指名の積み上げより当日の接客貢献度で評価する。',
        '同伴・アフターのアドバイスは控えめにする。',
        '',
        '【判断の原則】',
        '- マネージャーは見切りをつけない。数字が出ていないキャストにも改善の余地を必ず見つける',
        '- 売上だけで評価しない。出勤・場内指名・同伴・顧客ポートフォリオを複合的に見る',
        '- 数字が良いキャストへの「当たり前扱い」をしない',
        '- 短期（今月）と中期（来月以降）を分けてアドバイスする',
        '- 断定しない。「〜という可能性があります」「〜を検討してください」で提示する',
        '- データが少ない場合は「データ不足のため判断は慎重に」と明記する',
        '',
        '【回答フォーマット】',
        '以下の構成で日本語で答える：',
        '',
        '1. 総合評価（2〜3行）',
        '2. 良い点',
        '3. 課題',
        '4. 要フォロー顧客リスト（高リスク・要注意を名前付きで、優先順位と一言コメント）',
        '5. 今月の具体的なアクション（マネージャーがキャストに指示できる内容）',
        '6. 来月に向けた準備',
        '',
        'iPadで読みやすい長さにする。長くなりすぎない。',
        '最後に「最終判断はマネージャーが行ってください」を添える。',
        '',
        castBlock,
        '',
        customerBlock
      ].join('\n');
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1500,
        system: systemPrompt,
        messages: messages
      })
    });

    const data = await response.json();
    res.status(200).json(data);

  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
