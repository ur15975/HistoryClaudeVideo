// 历史专名的读音纠正：仅替换送进 TTS 的文本，字幕仍显示原字。
// 做法是换成读音相同的常用字，比拼音标注更稳定。
export const DEFAULT_PRONUNCIATIONS = {
  单于: '蝉于', // chán yú
  阏氏: '烟支', // yān zhī
  冒顿: '莫独', // mò dú
  月氏: '月支', // yuè zhī
  大宛: '大渊', // dà yuān
  龟兹: '秋词', // qiū cí
  吐谷浑: '吐玉浑', // tǔ yù hún
  可汗: '克寒', // kè hán
  堂邑父: '堂邑甫', // fǔ，古代男子美称
  甘父: '甘甫',
  身毒: '捐毒', // yuān dú（古印度）
  鄯善: '善善',
  番禺: '潘禺',
  会稽: '快稽',
};

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// lang 为中文时叠加默认读音表；其他语言只用剧本（覆盖层）自己的读音表
export function applyPronunciations(text, extra = {}, lang = 'zh') {
  const dict = lang.startsWith('zh') ? { ...DEFAULT_PRONUNCIATIONS, ...extra } : { ...extra };
  // 长词优先，避免“堂邑父”被“甘父”之类的短词抢先替换
  const keys = Object.keys(dict).sort((a, b) => b.length - a.length);
  let out = text;
  const cjk = /^(zh|ja)/.test(lang);
  for (const k of keys) {
    // 中文、日文：直接替换（与之前一致）；西文：整词替换，避免把 "Han" 换进 "Khan"，
    // 词边界只看拉丁字母和数字，紧挨汉字的键照样能替换
    if (cjk || /\p{Script=Han}/u.test(k)) out = out.split(k).join(dict[k]);
    else out = out.replace(new RegExp(`(?<![\\p{Script=Latin}\\p{M}\\d])${escapeRe(k)}(?![\\p{Script=Latin}\\p{M}\\d])`, 'gu'), () => dict[k]);
  }
  return out;
}
