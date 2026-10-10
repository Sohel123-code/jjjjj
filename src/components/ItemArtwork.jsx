// Original SVG illustrations for explicitly labelled sample posts.
export default function ItemArtwork({ item }) {
  if (item === 'headphones') return <svg viewBox="0 0 400 250" role="img" aria-label="Illustration of sage green over-ear headphones on a warm desk">
    <defs><linearGradient id="headphone-bg" x2="1" y2="1"><stop stopColor="#e2dece"/><stop offset="1" stopColor="#eeebe1"/></linearGradient><linearGradient id="headphone-metal"><stop stopColor="#526354"/><stop offset=".5" stopColor="#8c9b82"/><stop offset="1" stopColor="#556a55"/></linearGradient><filter id="headphone-shadow"><feGaussianBlur stdDeviation="9"/></filter></defs>
    <path fill="url(#headphone-bg)" d="M0 0h400v250H0z"/><path fill="#d5d0be" opacity=".3" d="m300 0 100 110v140H160z"/><ellipse cx="203" cy="207" rx="85" ry="14" fill="#7c816c" opacity=".22" filter="url(#headphone-shadow)"/>
    <g transform="translate(15 3) rotate(-13 200 130)"><path d="M121 155V112a72 72 0 0 1 144 0v43" fill="none" stroke="#485846" strokeWidth="21"/><path d="M126 108a67 67 0 0 1 134 0" fill="none" stroke="#a3ae92" strokeWidth="13"/><path d="M122 131v35m143-35v35" stroke="#bcc1ac" strokeWidth="10"/>
    <rect x="102" y="127" width="47" height="78" rx="22" fill="url(#headphone-metal)"/><rect x="110" y="131" width="31" height="71" rx="15" fill="#6f8265"/><rect x="241" y="127" width="47" height="78" rx="22" fill="url(#headphone-metal)"/><rect x="249" y="131" width="31" height="71" rx="15" fill="#7d8e70"/><path d="M260 147v37" stroke="#a5b097" strokeWidth="2" opacity=".6"/></g>
    <path d="m31 217 27-5 4 22-27 5z" fill="#f7f2df"/><path d="m38 222 14-3m-12 7 13-2" stroke="#c2bca4"/>
  </svg>;
  if (item === 'bottle') return <svg viewBox="0 0 400 250" role="img" aria-label="Illustration of a blue water bottle beside a notebook">
    <defs><linearGradient id="bottle-bg" x2="1" y2="1"><stop stopColor="#dfe8e0"/><stop offset="1" stopColor="#cbd8ce"/></linearGradient><linearGradient id="bottle-body"><stop stopColor="#648895"/><stop offset=".4" stopColor="#96b3bb"/><stop offset="1" stopColor="#597d8b"/></linearGradient><filter id="bottle-shadow"><feGaussianBlur stdDeviation="7"/></filter></defs>
    <path fill="url(#bottle-bg)" d="M0 0h400v250H0z"/><ellipse cx="202" cy="220" rx="64" ry="12" fill="#638174" opacity=".2" filter="url(#bottle-shadow)"/>
    <g transform="rotate(13 260 195)"><rect x="258" y="87" width="123" height="172" rx="5" fill="#c4c9ae"/><path d="M265 88v165" stroke="#a6b08d" strokeWidth="3"/><path d="M294 100v151" stroke="#e1e4d0" strokeWidth="2"/></g>
    <g transform="rotate(-9 181 130)"><path d="M151 78q0-13 11-17v-9h40v9q11 4 11 17v118q0 14-14 14h-34q-14 0-14-14z" fill="url(#bottle-body)"/><rect x="160" y="40" width="44" height="21" rx="5" fill="#527681"/><path d="M165 43v-6q0-12 13-12h12q13 0 13 12v7" fill="none" stroke="#527681" strokeWidth="5"/><path d="M161 89v95" stroke="#c0d2d1" strokeWidth="3" opacity=".4"/><circle cx="182" cy="143" r="15" fill="#e1ebdf"/><path d="m177 143 4 4 7-9" stroke="#7b9a81" strokeWidth="2" fill="none"/></g>
    <path d="m25 18 82 0-11 74-70-21z" fill="#f1f2dc" opacity=".5"/>
  </svg>;
  return <svg viewBox="0 0 400 250" role="img" aria-label="Illustration of a returned keyring with a green tag">
    <defs><linearGradient id="keys-bg" x2="1" y2="1"><stop stopColor="#e9dfcd"/><stop offset="1" stopColor="#efe9dc"/></linearGradient><linearGradient id="keys-metal"><stop stopColor="#9b9c8c"/><stop offset=".45" stopColor="#dadace"/><stop offset="1" stopColor="#949889"/></linearGradient><filter id="keys-shadow"><feGaussianBlur stdDeviation="8"/></filter></defs>
    <path fill="url(#keys-bg)" d="M0 0h400v250H0z"/><ellipse cx="208" cy="190" rx="95" ry="16" fill="#8b836c" opacity=".2" filter="url(#keys-shadow)"/>
    <g transform="rotate(-22 210 140)"><rect x="207" y="102" width="80" height="105" rx="13" fill="#72876a"/><rect x="214" y="109" width="66" height="91" rx="9" stroke="#9eae8f" fill="none"/><circle cx="248" cy="113" r="5" fill="#dadcc8"/><path d="m233 154 11 11 22-25" stroke="#e6e9d9" strokeWidth="4" fill="none" strokeLinecap="round"/><path d="M210 79q42 10 38 33" stroke="#c5c7b8" strokeWidth="4" fill="none"/>
    <g transform="rotate(15 180 90)"><path d="M184 112v81h13v-12h12v-13h-12v-17h8v-15h-8v-24" fill="url(#keys-metal)"/><circle cx="189" cy="100" r="21" fill="url(#keys-metal)"/><circle cx="189" cy="96" r="9" fill="#e9e2d3"/></g>
    <circle cx="191" cy="81" r="28" stroke="#8f998c" strokeWidth="5" fill="none"/><path d="M168 65a28 28 0 0 1 43 1" stroke="#deded1" strokeWidth="3" fill="none"/>
    </g><g transform="rotate(8 310 52)"><rect x="283" y="32" width="66" height="34" rx="4" fill="#fbf7e9"/><text x="316" y="53" textAnchor="middle" fill="#8f997d" fontSize="8" fontFamily="sans-serif">home again ♡</text></g>
  </svg>;
}
