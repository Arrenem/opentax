#!/usr/bin/env python3
"""Generate original, source-backed article diagrams and 1200x630 social images.

Requires Pillow and fontTools. Uses only checked-in Japanese fonts and
article text. No network, screenshots, stock photography or generative assets.
Run from any directory: python scripts/site/generate-article-visuals.py
Every factual label is validated against its source article before writing.
"""
from __future__ import annotations
import argparse, base64, hashlib, html, io, json, re
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[2]
INK = '#183630'; MUTED = '#526760'; GREEN = '#196854'; PALE = '#edf5f1'
LINE = '#cbded4'; PAPER = '#fbfcfa'; WHITE = '#ffffff'; AMBER = '#92570b'
FONTS = {False: ROOT/'public/fonts/NotoSansJP-Regular.ttf', True: ROOT/'public/fonts/NotoSansJP-Bold.ttf'}
FONT_CACHE = {}
def font(size, bold=False):
    key=(size,bold)
    if key not in FONT_CACHE: FONT_CACHE[key]=ImageFont.truetype(str(FONTS[bold]), size)
    return FONT_CACHE[key]
def clean(s):
    s=re.sub(r'\[([^]]+)\]\([^)]+\)',r'\1',s)
    return re.sub(r'[*`]', '', s).strip()
def norm(s): return re.sub(r'\s+', '', clean(s))
def display(s):
    return s.translate(str.maketrans({'㎡':'平方メートル','①':'(1)','②':'(2)','③':'(3)','④':'(4)','⑤':'(5)'}))

def wrap(s, size, width, bold=False):
    """Pixel-measured Japanese wrapping; avoid punctuation at line start."""
    s=display(s)
    lines=[]; line=''; f=font(size,bold)
    for char in s:
        if char=='\n': lines.append(line); line=''; continue
        if line and f.getlength(line+char)>width and char not in '、。，．）］」』】％%':
            lines.append(line.rstrip());line=char.lstrip()
        else: line+=char
    if line: lines.append(line.rstrip())
    return lines or ['']

# Each tuple chooses a single useful source table and a bounded excerpt.
# (table index, row indexes, columns after the row label, graphic kind)
SELECT = {
'accounting-backup-restore': (0,[0,1,2],[1,2],'compare'),
'accounting-csv-import-errors': (0,[0,1,4],[1,2],'decision'),
'accounting-mcp-comparison': (0,[0,1,2],[1,2],'compare'),
'accounting-migration-reconciliation': (0,[0,1],[1,2,3],'compare'),
'accounting-migration-timing': (0,[0,1,2],[1,2],'decision'),
'accounting-open-source-license': (0,[0,1,2],[1,2],'compare'),
'accounting-operations-options': (0,[0,1,2],[1,2],'compare'),
'accounting-without-subscription': (1,[0,1,2,3],[2,3],'amount'),
'accounts-receivable-reconciliation-howto': (0,[0,1,2],[1,2,4],'compare'),
'ai-journal-entry-workflow': (0,[1,3,5],[1,2],'decision'),
'ai-tax-return-howto': (1,[0,1,2],[1,2],'flow'),
'bank-statement-csv-bookkeeping': (0,[0,1,2],[1,4],'decision'),
'blue-return-financial-statements-howto': (0,[0,7,8],[1],'amount'),
'business-use-expense-apportionment': (0,[0,1,2,4],[1],'amount'),
'computer-depreciation-sole-proprietor': (1,[0,1],[1,2],'flow'),
'credit-card-journal-sole-proprietor': (0,[0,1],[1,2,3,4],'flow'),
'double-entry-bookkeeping-howto': (1,[2,3,4],[1,2,3],'decision'),
'electronic-transaction-records-howto': (1,[0,1,4],[1],'flow'),
'etax-filing-sole-proprietor': (1,[0,1,2,3],[1],'flow'),
'excel-to-accounting-software': (2,[0,1,2],[1,2,3],'flow'),
'frappe-books-japan-review': (0,[0,2,3],[1,2],'compare'),
'free-accounting-for-freelancers': (1,[0,1,2],[1,2],'decision'),
'free-accounting-mac-linux': (0,[0,1,3],[1,3],'compare'),
'free-accounting-side-business': (0,[0,2,4],[1,2],'decision'),
'free-accounting-software': (0,[0,1,2],[1,3],'compare'),
'free-ai-accounting-limits': (0,[0,1,2],[1,2],'flow'),
'free-blue-return-software': (1,[0,1,2,3],[1,2],'decision'),
'free-cloud-accounting': (1,[0,1,3],[1,2],'compare'),
'free-white-return-software': (0,[0,1,2],[1,3],'compare'),
'freee-alternatives': (0,[0,3,4],[1,2],'decision'),
'freee-free-plan-limits': (0,[1,2,3],[1,2],'compare'),
'freee-journal-csv-export': (0,[0,1,2,3],[1,2],'decision'),
'freee-starter-standard-choice': (0,[0,6,7],[1,2],'compare'),
'gnucash-japan-accounting-review': (0,[0,1,2],[1],'flow'),
'moneyforward-cost-review': (2,[1,3,4],[1,2],'compare'),
'moneyforward-free-limits': (1,[0,1,2,3,4],[1],'amount'),
'monthly-bookkeeping-reconciliation': (0,[0,1,2],[1,2,3],'decision'),
'open-source-accounting-japan-checklist': (0,[0,1,2,3],[1,2],'flow'),
'open-source-accounting-software': (0,[0,1,2],[1,3],'compare'),
'opentax-vs-freee': (0,[0,2,4],[1,2],'compare'),
'owners-drawings-contributions-journal': (0,[0,1,2],[1,2],'decision'),
'receipt-organization-sole-proprietor': (0,[0,1,2],[2,4],'decision'),
'self-hosted-accounting-cost': (1,[0,1,2],[1],'amount'),
'self-hosted-accounting-guide': (0,[0,1,2,3],[1,2],'structure'),
'sole-proprietor-bookkeeping-routine': (0,[0,1,2],[1,3],'flow'),
'startup-costs-bookkeeping-sole-proprietor': (1,[0,1,2],[1,2,3],'flow'),
'switch-from-moneyforward': (0,[0,1,2],[1,2],'decision'),
'withheld-freelance-fees-journal': (1,[0,1],[1,2],'compare'),
'yayoi-free-options': (0,[0,1,2],[1,2,3],'compare'),
'year-end-bookkeeping-adjustments': (0,[0,1],[1,2],'compare'),
}

# Four diagrams use article prose rather than a Markdown table.
CUSTOM = {
'business-use-expense-apportionment': {
 'heading':'section-2','kind':'amount','title':'面積20％なら、家賃の事業分は2万円',
 'cards':[
  {'label':'月の家賃','value':'100,000円','detail':''},
  {'label':'事業割合','value':'10÷50＝20％','detail':'住居全体の面積50㎡、仕事専用部分の面積10㎡','evidence':['住居全体の面積','50㎡','仕事専用部分の面積','10㎡']},
  {'label':'月の事業部分','value':'20,000円','detail':'100,000×20％＝20,000円'}],
 'note':'本文の架空例。仕事専用の面積で区分できる場合。使い方が変われば根拠も見直します。'},
'moneyforward-free-limits': {
 'heading':'count','kind':'amount','title':'月13件なら、年間は156件',
 'cards':[
  {'label':'毎月記録するもの','value':'売上4件＋入金4件＋経費5件','detail':'一月の合計：13件','evidence':['売上の計上 | 4件','売掛金の入金 | 4件','経費 | 5件','一月の合計 | 13件']},
  {'label':'同じ取引量の12か月分','value':'156件','detail':''},
  {'label':'未契約での無償利用','value':'1会計年度50件まで','detail':''}],
 'note':'本文の架空例。仕訳の件数は請求書の枚数だけでは数えません。'},

'accountant-handoff-software-switch': {
 'heading':'section-3','kind':'flow','title':'取引番号で、修正前後をつなぐ',
 'cards': [
  {'label':'取引番号','value':'T018','detail':''},
  {'label':'変更前','value':'消耗品費1,100円','detail':''},
  {'label':'変更後','value':'通信費1,100円','detail':'携帯電話の利用料だったため'}],
 'note':'本人が反映して税理士が確認するのか、税理士が直接直して本人へ知らせるのかを一つに決めます。'},
'accounting-evidence-migration': {
 'heading':'section-3','kind':'mapping','title':'取引番号とファイルを結び付ける',
 'cards':[
  {'label':'T001','value':'E001.pdf','detail':'2026/10/02・1,100円・架空通信','evidence':['2026/10/02','1,100円','架空通信']},
  {'label':'T002','value':'E002-請求書.pdf\nE003-支払控え.pdf','detail':'2026/10/05・11,000円・架空文具店','evidence':['E002-請求書.pdf','E003-支払控え.pdf','2026/10/05','11,000円','架空文具店']}],
 'note':'本文の架空例。T002には請求書と支払控えの2ファイルを対応づけます。'},
'freee-cancellation-data-checklist': {
 'heading':'section-2','kind':'checklist','title':'解約前に、五つの資料を保存',
 'cards':[
  {'label':'仕訳','value':'仕訳CSVと仕訳帳PDF','detail':''},
  {'label':'帳簿・帳票','value':'総勘定元帳、試算表、貸借対照表などの帳簿・帳票','detail':''},
  {'label':'申告','value':'確定申告書、青色申告決算書や収支内訳書、送信結果','detail':''},
  {'label':'未決済・固定資産','value':'未入金・未払いの一覧と固定資産の取得・償却資料','detail':''},
  {'label':'元のファイル','value':'領収書、請求書、銀行明細などのファイル本体','detail':''}],
 'note':'領収書のリンクだけでなく、ファイル本体まで保存します。'},
'switch-from-freee': {
 'heading':'section-4','kind':'amount','title':'移行後の預金残高を検算する',
 'cards':[
  {'label':'期首の普通預金','value':'100,000円','detail':'売掛金30,000円','evidence':['期首に普通預金100,000円','売掛金30,000円']},
  {'label':'売掛金を全額回収','value':'＋30,000円','detail':'通信費5,000円を支払った','evidence':['売掛金30,000円','通信費5,000円を支払った']},
  {'label':'普通預金','value':'125,000円','detail':'売掛金は0円','evidence':['普通預金は125,000円','売掛金は0円']}],
 'note':'架空例：100,000＋30,000−5,000＝125,000円。売掛金も0円か確認。'},
}

TITLES={
'accounting-backup-restore':'戻したいものから保存方法を選ぶ',
'accounting-csv-import-errors':'CSVエラーの症状から直す場所へ',
'accounting-mcp-comparison':'会計MCPの操作範囲と確認事項',
'accounting-migration-reconciliation':'入金の二重登録は残高のペアで発見',
'accounting-migration-timing':'切替時期で、引き継ぐデータが変わる',
'accounting-open-source-license':'「無料」と「ソース公開」の違い',
'accounting-operations-options':'導入後の更新・保存を誰が担うか',
'accounting-without-subscription':'やよいを3年使う費用の例',
'accounts-receivable-reconciliation-howto':'請求ごとに入金と残額を合わせる',
'ai-journal-entry-workflow':'AIの仕訳を、取引の中身で確認',
'ai-tax-return-howto':'請求と入金を別の仕訳にする',
'bank-statement-csv-bookkeeping':'銀行明細から、売上と精算を分ける',
'blue-return-financial-statements-howto':'売上から控除前の所得へ',
'business-use-expense-apportionment':'仕事用の面積から家賃を按分',
'computer-depreciation-sole-proprietor':'24万円のPC：購入と償却を分ける',
'credit-card-journal-sole-proprietor':'カード利用と引落しは2回に分ける',
'double-entry-bookkeeping-howto':'取引を、借方と貸方で記録する',
'electronic-transaction-records-howto':'索引から原資料へ戻れるようにする',
'etax-filing-sole-proprietor':'e-Taxは送信後の確認まで',
'excel-to-accounting-software':'Excelからの移行は3件で試す',
'frappe-books-japan-review':'Frappe Booksの現行版と旧版',
'free-accounting-for-freelancers':'税理士との分担からソフトを選ぶ',
'free-accounting-mac-linux':'Mac・Linuxの利用条件を比べる',
'free-accounting-side-business':'副業は件数より取引の中身で選ぶ',
'free-accounting-software':'継続無料・初年度無料・お試し',
'free-ai-accounting-limits':'AIに頼む作業と、人が見る点',
'free-blue-return-software':'青色決算書へ移す前の確認',
'free-cloud-accounting':'Web会計の更新と保存の担当',
'free-white-return-software':'白色申告までに必要な作業を比べる',
'freee-alternatives':'困りごとからfreeeの代わりを選ぶ',
'freee-free-plan-limits':'freeeの無料お試しと有料契約',
'freee-journal-csv-export':'freeeの出力形式を目的で選ぶ',
'freee-starter-standard-choice':'freeeの年額と必要機能を比べる',
'gnucash-japan-accounting-review':'GnuCashの帳簿から日本の申告へ',
'moneyforward-cost-review':'MF年額：2026年12月の改定前後',
'moneyforward-free-limits':'月13件なら、年間は156件',
'monthly-bookkeeping-reconciliation':'預金の差額から原因を探す',
'open-source-accounting-japan-checklist':'記帳から提出まで、四つの工程',
'open-source-accounting-software':'3製品の使う場所と申告の分担',
'opentax-vs-freee':'freeeとOpenTaxの記帳・確認・連携',
'owners-drawings-contributions-journal':'お金の向きで事業主勘定を分ける',
'receipt-organization-sole-proprietor':'領収書は資料番号と処理状況で追う',
'self-hosted-accounting-cost':'領収書100枚から年間保存量を見積もる',
'self-hosted-accounting-guide':'アプリ・帳簿・ファイル・認証',
'sole-proprietor-bookkeeping-routine':'1週間の記帳：請求から回収まで',
'startup-costs-bookkeeping-sole-proprietor':'開業費10万円を3年で償却する例',
'switch-from-moneyforward':'MFの書き出し形式を目的で選ぶ',
'withheld-freelance-fees-journal':'源泉対象額で入金額は変わる',
'yayoi-free-options':'やよいの無料条件を三つに分ける',
'year-end-bookkeeping-adjustments':'年末の未入金と前金を分ける',
}
NOTES={
'accounting-without-subscription':'料金が変わらない場合の例。税抜・税込を併記。2026年10月3日確認。',
'accounts-receivable-reconciliation-howto':'本文の架空例。理由未確認の330円は売掛金に残します。',
'ai-journal-entry-workflow':'本文の架空10件から3件を抜粋。登録結果は人が確認します。',
'ai-tax-return-howto':'本文の架空例。入金で売上を再計上しません。',
'bank-statement-csv-bookkeeping':'本文の架空5件から3件を抜粋。',
'blue-return-financial-statements-howto':'本文の架空例。青色申告特別控除前の所得です。',
'business-use-expense-apportionment':'本文の架空例。10㎡を仕事専用に使う場合。実態に合う根拠が必要です。',
'computer-depreciation-sole-proprietor':'本文の架空例。新品・4年定額法、7〜12月の6か月。特例は使わない場合。',
'credit-card-journal-sole-proprietor':'本文の架空例。引落し時に経費を重ねて計上しません。',
'double-entry-bookkeeping-howto':'本文の架空5取引から3件を抜粋。',
'excel-to-accounting-software':'本文の架空例。売上20,000円、借方・貸方合計は各41,000円。',
'free-accounting-mac-linux':'本文の候補から抜粋。Linuxの「記載なし」は利用不可という意味ではありません。',
'free-accounting-software':'本文の6候補から3候補を抜粋。年額は税抜、2026年10月3日確認。',
'freee-starter-standard-choice':'Web契約の年払い・税抜。2026年10月3日確認。',
'moneyforward-cost-review':'Web契約・税抜。改定は2026年12月1日。既存契約は以降の更新から。',
'moneyforward-free-limits':'本文の架空例。未契約の無償利用は1会計年度50件まで。',
'monthly-bookkeeping-reconciliation':'本文の架空例。銀行の実残高は500,000円。',
'self-hosted-accounting-cost':'本文の架空の容量計算。料金の試算ではありません。',
'startup-costs-bookkeeping-sole-proprietor':'本文の架空例。償却額は未償却残高の範囲で決めます。',
'withheld-freelance-fees-journal':'2026年の原稿料の例。請求総額110,000円、振込手数料なし。',
'yayoi-free-options':'2026年10月3日確認。初年度無料と無料体験は条件が異なります。',
'year-end-bookkeeping-adjustments':'本文の架空例。完了した仕事と翌年に提供する仕事を分けます。',
}


def parse_tables(md):
    tables=[]; heading=None; lines=md.splitlines();i=0
    while i<len(lines):
        m=re.match(r'#{2,3}\s+(.+?)\s+\{#([^}]+)\}',lines[i])
        if m: heading={'label':m[1],'id':m[2]}
        if lines[i].startswith('|'):
            rows=[]
            while i<len(lines) and lines[i].startswith('|'):
                cells=[clean(x) for x in lines[i].strip().strip('|').split('|')]
                if not all(re.fullmatch(r':?-+:?',x.replace(' ','')) for x in cells): rows.append(cells)
                i+=1
            assert heading and len(rows)>1
            tables.append({'heading':heading,'headers':rows[0],'rows':rows[1:]});continue
        i+=1
    return tables


def build_spec(slug, md, metadata):
    if slug in CUSTOM:
        spec=dict(CUSTOM[slug]); spec['cards']=[dict(c) for c in spec['cards']]
        for c in spec['cards']:
            evidence=c.get('evidence', [c['value'], c['detail']])
            for text in evidence:
                assert not text or norm(text) in norm(md), (slug,text)
        spec['tableExcerpt']=False
    else:
        ti, rows, cols, kind=SELECT[slug];table=parse_tables(md)[ti]
        cards=[]
        for ri in rows:
            row=table['rows'][ri]
            fields=[{'label':table['headers'][ci], 'text':row[ci]} for ci in cols]
            cards.append({'label':row[0], 'value':fields[0]['text'],
              'detail':'\n'.join(f"{x['label']}：{x['text']}" for x in fields[1:]),
              'fields':fields})
            for cell in [row[0]]+[row[c] for c in cols]:
                assert norm(cell) in norm(md),(slug,cell)
        spec={'heading':table['heading']['id'],'title':TITLES[slug], 'kind':kind,
              'cards':cards, 'tableExcerpt':True, 'sourceTable':ti,
              'sourceRows':rows,'sourceColumns':[0]+cols,
              'tableHeaders':table['headers'],'firstFieldLabel':table['headers'][cols[0]]}
    spec.setdefault('note',NOTES.get(slug,'本文の表・具体例から要点を抜粋。詳しい条件は本文で確認できます。'))
    spec['slug']=slug;spec['articleTitle']=metadata['title']
    assert '{#'+spec['heading']+'}' in md,(slug,'missing heading')
    return spec


class Canvas:
    def __init__(self,w,h): self.w=w;self.h=h;self.items=[]
    def rect(self,x,y,w,h,fill, radius=0,stroke=None): self.items.append(('rect',(x,y,w,h,fill,radius,stroke)))
    def line(self,x1,y1,x2,y2,color,width=2):self.items.append(('line',(x1,y1,x2,y2,color,width)))
    def text(self,s,x,y,size=32,color=INK,bold=False):
        # y is the top of the text line, independent of Japanese font ascenders.
        self.items.append(('text',(display(s),x,y,size,color,bold)))
    def block(self,s,x,y,size,width,color=INK,bold=False,gap=1.43):
        ls=wrap(s,size,width,bold)
        for i,line in enumerate(ls): self.text(line,x,y+i*size*gap,size,color,bold)
        return y+len(ls)*size*gap
    def png(self,path):
        im=Image.new('RGB',(self.w,self.h),PAPER);d=ImageDraw.Draw(im)
        for kind,a in self.items:
            if kind=='rect':
                x,y,w,h,fill,r,stroke=a;d.rounded_rectangle((x,y,x+w,y+h),r,fill,outline=stroke,width=2)
            elif kind=='line':
                x,y,x2,y2,c,w=a;d.line((x,y,x2,y2),fill=c,width=w)
            else:
                s,x,y,sz,c,b=a;d.text((x,y),s,font=font(sz,b),fill=c,anchor='lt')
        im.save(path,optimize=True)
    def svg(self,path,title,description):
        # Embed subset fonts: Japanese SVG text remains legible when used in <img>,
        # even on devices without the project's fonts or network font access.
        styles=[]
        for bold in [False,True]:
            chars=''.join(a[0] for k,a in self.items if k=='text' and a[-1]==bold)
            if not chars:continue
            opt=subset.Options();opt.flavor='woff';opt.layout_features=[]
            ft=TTFont(str(FONTS[bold]));sub=subset.Subsetter(options=opt);sub.populate(text=chars);sub.subset(ft)
            ft.flavor='woff';buf=io.BytesIO();ft.save(buf)
            styles.append("@font-face{font-family:ArticleJP; font-weight:%s;src:url(data:font/woff;base64,%s) format('woff')}" % ('700' if bold else '400',base64.b64encode(buf.getvalue()).decode()))
        parts=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.w}" height="{self.h}" viewBox="0 0 {self.w} {self.h}" role="img" aria-labelledby="title desc">',
               f'<title id="title">{html.escape(title)}</title><desc id="desc">{html.escape(description)}</desc>',
               '<style>'+''.join(styles)+'text{font-family:ArticleJP,sans-serif}</style>']
        for kind,a in self.items:
            if kind=='rect':
                x,y,w,h,fill,r,stroke=a;parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}"'+(f' stroke="{stroke}" stroke-width="2"' if stroke else '')+'/>')
            elif kind=='line':
                x,y,x2,y2,c,w=a;parts.append(f'<line x1="{x}" y1="{y}" x2="{x2}" y2="{y2}" stroke="{c}" stroke-width="{w}"/>')
            else:
                s,x,y,sz,c,b=a
                # Match Pillow's glyph top positioning with explicit font ascender.
                top=font(sz,b).getbbox(s)[1]; baseline=y+font(sz,b).getmetrics()[0]-top
                parts.append(f'<text x="{x}" y="{baseline}" font-size="{sz}" font-weight="{700 if b else 400}" fill="{c}">{html.escape(s)}</text>')
        parts.append('</svg>');path.write_text('\n'.join(parts),encoding='utf-8')


def guide(spec):
    c=Canvas(720,1000)
    c.rect(0,0,720,1000,PAPER)
    c.text('OpenTax  /  会計ガイド',32,28,24,MUTED,True)
    y=c.block(spec['title'],32,80,38,656,INK,True)+26
    kind=spec['kind']
    for i,card in enumerate(spec['cards']):
        start=y
        # One column, 32px factual text: readable without horizontal scrolling.
        label_lines=wrap(card['label'],32,584,True)
        value_lines=wrap(card['value'],36,592,True)
        detail_lines=wrap(card['detail'],32,592) if card['detail'] else []
        field_label=spec.get('firstFieldLabel','')
        height=30+len(label_lines)*45.76+18+(35 if field_label else 0)+len(value_lines)*51.48+(18+len(detail_lines)*45.76 if detail_lines else 0)+28
        c.rect(32,y,656,height,WHITE,22,LINE)
        c.rect(32,y,8,height,GREEN,4)
        y=c.block(card['label'],60,y+26,32,592,INK,True)+14
        if field_label: c.text(field_label,60,y,24,MUTED);y+=35
        y=c.block(card['value'],60,y,36,592,GREEN,True)
        if card['detail']: y=c.block(card['detail'],60,y+18,32,592,MUTED)
        y=start+height
        if i<len(spec['cards'])-1:
            if kind in ['flow','amount']:
                c.line(360,y+5,360,y+31,GREEN,3)
                c.line(348,y+20,360,y+32,GREEN,3);c.line(372,y+20,360,y+32,GREEN,3)
                y+=40
            else:y+=20
    y=c.block(spec['note'],32,y+24,28,656,MUTED)+28
    c.line(32,y,688,y,LINE,2);c.text('OpenTax編集部作成  ·  2026年10月3日',32,y+20,23,MUTED)
    c.h=int(y+70);c.items[0]=('rect',(0,0,720,c.h,PAPER,0,None))
    return c


def share(spec):
    c=Canvas(1200,630);c.rect(0,0,1200,630,PAPER)
    c.rect(0,0,16,630,GREEN)
    c.text('OpenTax',48,28,28,GREEN,True)
    c.text('会計・確定申告ガイド',222,34,22,MUTED)
    title_lines=wrap(spec['title'],42,1096,True)
    assert len(title_lines)<=2,(spec['slug'],'share title too long')
    y=c.block(spec['title'],48,86,42,1096,INK,True)+25
    cards=spec['cards']
    # Preserve totals for calculations, including the source's monthly/yearly count.
    if len(cards)>3: cards=[cards[0], cards[1], cards[-1]]
    n=len(cards);gap=22;width=(1104-gap*(n-1))/n
    bottom=514; cardh=bottom-y
    for i,card in enumerate(cards):
        x=48+i*(width+gap);c.rect(x,y,width,cardh,WHITE,20,LINE)
        # Fit labels and values by bounded font reduction, never ellipsize facts.
        label=card['label'];value=card['value'];detail=card['detail']
        # Show at most the first two comparison dimensions in social previews.
        if card.get('fields'):
            fs=card['fields']
            value=f"{fs[0]['label']}\n{fs[0]['text']}"
            detail='\n'.join(f"{f['label']}：{f['text']}" for f in fs[1:2])
        if spec['slug']=='freee-cancellation-data-checklist':detail=''
        size=26
        while size>=19:
            h=len(wrap(label,size,width-40,True))*size*1.35+16+len(wrap(value,size+2,width-40,True))*(size+2)*1.35
            if detail:h+=16+len(wrap(detail,size-2,width-40))*(size-2)*1.35
            if h<=cardh-40:break
            size-=1
        assert size>=19,(spec['slug'],'OG card too dense',label,cardh)
        yy=c.block(label,x+20,y+22,size,width-40,INK,True,1.35)+16
        yy=c.block(value,x+20,yy,size+2,width-40,GREEN,True,1.35)
        if detail:yy=c.block(detail,x+20,yy+16,size-2,width-40,MUTED,False,1.35)
        assert yy<=bottom-10,(spec['slug'],'OG overflow')
        if i<n-1 and spec['kind'] in ['flow','amount']:
            mid=x+width+gap/2;c.text('›',mid-6,y+cardh/2-22,26,GREEN,True)
    note=spec['note'];notels=wrap(note,22,1104)
    if len(notels)>3:
        note='本文の表・具体例を抜粋。詳しい条件は記事で確認できます。'
    c.block(note,48,540,22,1104,MUTED,gap=1.38)
    return c


def main():
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--source-root',type=Path)
    ap.add_argument('--preview-dir',type=Path);ap.add_argument('--only');args=ap.parse_args()
    source=args.source_root
    article_dir=source/'articles' if source else ROOT/'content/articles'
    metadata_dir=source/'metadata' if source else ROOT/'content/articles/editorial'
    mfpath=ROOT/'content/articles/visual-assets.json'
    manifest=json.loads(mfpath.read_text()) if args.only and mfpath.exists() else {}
    files=sorted(metadata_dir.glob('*.json'))
    assert files, f'No editorial metadata in {metadata_dir}'
    for f in files:
        data=json.loads(f.read_text());slug=data['slug']
        if slug=='freee-cost-review' or (args.only and slug!=args.only):continue
        md=(article_dir/f'{slug}.md').read_text()
        spec=build_spec(slug,md,data)
        output=ROOT/'site/article-assets'/slug;output.mkdir(parents=True,exist_ok=True)
        text=[]
        for card in spec['cards']:
            first=spec.get('firstFieldLabel')
            text.append(card['label']+'：'+(first+'：' if first else '')+card['value']+('。'+card['detail'].replace('\n','。') if card['detail'] else ''))
        text.append(spec['note'])
        body=guide(spec);social=share(spec)
        body.svg(output/'guide.svg',spec['title'],'。'.join(text))
        social.png(output/'share.png')
        if args.preview_dir:
            args.preview_dir.mkdir(parents=True,exist_ok=True);body.png(args.preview_dir/f'{slug}.png')
        sourceurl='https://github.com/Arrenem/opentax/pull/4'
        provenance={'creator':'OpenTax編集部','license':'original-editorial',
            'credit':'OpenTax編集部作成（記事内の比較表・架空例を図解）',
            'sourceArticle':f'content/articles/{slug}.md','sourceHeadingId':spec['heading'],
            'sourceUrl':sourceurl,'licenseUrl':'https://github.com/Arrenem/opentax/blob/main/LICENSE',
            'sourceUrls':[s['url'] for s in data['sources']], 'checkedAt':data['updatedAt'],
            'articleSha256':hashlib.sha256(md.encode()).hexdigest(),
            'sourceTableIndex':spec.get('sourceTable'), 'sourceRowIndexes':spec.get('sourceRows'),
            'sourceColumnIndexes':spec.get('sourceColumns'),
            'thirdPartyBinary':False,'generator':'scripts/site/generate-article-visuals.py'}
        manifest[slug]={'guide':{'src':f'/article-assets/{slug}/guide.svg','width':body.w,'height':body.h,
            'alt':spec['title']+'。詳しい内容は直後のテキストと本文に記載。',
            'caption':spec['title']+'。'+spec['note'],
            'placement':{'headingId':spec['heading'],'position':'after-heading'},
            'accessibleText':text,'kind':spec['kind']},
            'share':{'src':f'/article-assets/{slug}/share.png','width':1200,'height':630,
                     'alt':spec['title']+'：本文の比較・具体例の要点',
                     'caption':spec['title']+'。'+spec['note']},
            'provenance':provenance}
        print(slug,body.w,body.h,flush=True)
    assert args.only or len(manifest)==54,len(manifest)
    mfpath.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    print(f'Wrote {len(manifest)} visual records to {mfpath}')
if __name__=='__main__':main()
