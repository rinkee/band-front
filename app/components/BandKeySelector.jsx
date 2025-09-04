"use client";

import React, { useState, useEffect } from "react";
import { 
  ChevronDownIcon, 
  CheckIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon
} from "@heroicons/react/24/outline";

// 밴드 키 데이터
const BAND_KEYS = [
  {
    id: "alterbreez",
    band_key: "AACTxdg0FR59GZmyd95XFQr-",
    name: "AlterBreez",
    cover: "https://coresos-phinf.pstatic.net/a/2ih0b3/8_66hUd018adm56beg1mnq8ik_38xgnr.jpg",
    member_count: 11
  },
  {
    id: "gabin-namwon",
    band_key: "AAAZhwt1BC6KT8fYMbZDfwXN",
    name: "가빈과일&장봐주는과일오빠(남원점)",
    cover: "https://coresos-phinf.pstatic.net/a/3495a2/6_caaUd018svc1ewjz6wcgcpic_despyk.jpg",
    member_count: 3010
  },
  {
    id: "gabin-duam",
    band_key: "AAA5oNOH7-HG4phP58u8QpP8",
    name: "가빈과일&장봐주는과일오빠(두암점)",
    cover: "https://coresos-phinf.pstatic.net/a/37ef43/g_gjaUd018svcndpsafd938s3_eunz4t.jpg",
    member_count: 1479
  },
  {
    id: "gabin-haenam",
    band_key: "AAAP_UNq5T7e95HgLC3dfYXP",
    name: "가빈과일,마켓(해남점) 061-532-8872",
    cover: "https://coresos-phinf.pstatic.net/a/337fah/d_fheUd018svc1c5baomil9bhe_despyk.jpg",
    member_count: 2524
  },
  {
    id: "comment-band",
    band_key: "AADlR1ebdBcadJk0v-It9wZj",
    name: "댓글 밴드",
    cover: "https://coresos-phinf.pstatic.net/a/34g0a7/9_8a2Ud018adm1nuw67te3pqql_5ksoqj.png",
    member_count: 3
  },
  {
    id: "alterbreez2",
    band_key: "AACx6WsgmFihU5rrhON0ol0r",
    name: "얼터브리즈",
    cover: "https://coresos-phinf.pstatic.net/a/2ih01f/8_56hUd018admx65d4rek8itj_gt1f83.jpg",
    member_count: 26
  },
  {
    id: "yubyeolnan",
    band_key: "AACnX1If-JMjhNfi-qGuUDij",
    name: "유별난청과(금호동)",
    cover: "https://coresos-phinf.pstatic.net/a/387ii3/4_b5dUd018svcqxmgui2xbcgd_ewqnwl.png",
    member_count: 640
  },
  {
    id: "jangbwa-naun",
    band_key: "AADA_7D7zXB6NAoyBb804nRG",
    name: "장봐주는 언니 나운점",
    cover: "https://coresos-phinf.pstatic.net/a/35ci8d/c_g49Ud018svcynuk8gbqpq98_vooup1.jpg",
    member_count: 806
  },
  {
    id: "jangbwa-susong",
    band_key: "AABIfbFCMHTww_TlW8Rrrmja",
    name: "장봐주는 언니 수송점",
    cover: "https://coresos-phinf.pstatic.net/a/378c0b/8_e4jUd018svc34fs4lhk5igj_csd4st.jpg",
    member_count: 794
  },
  {
    id: "jangbwa-jochon",
    band_key: "AACx_YiaV5fqWT_QmHuHUZol",
    name: "장봐주는 언니 조촌점",
    cover: "https://coresos-phinf.pstatic.net/a/35g1a3/0_j5iUd018svcdfuoebx0grk8_1ej3t7.jpg",
    member_count: 980
  },
  {
    id: "jangbwa-jigok",
    band_key: "AAD07vAqTnaZ-CG0deum0tHN",
    name: "장봐주는언니 지곡점",
    cover: "https://coresos-phinf.pstatic.net/a/3893j7/e_9eaUd018svcdy9jl69cqe4f_jtblp.jpg",
    member_count: 554
  },
  {
    id: "cheongnyeon-jindo",
    band_key: "AACjV4MVRzPnrID84TROfxlm",
    name: "청년과일 (진도점)",
    cover: "https://coresos-phinf.pstatic.net/a/38400f/0_837Ud018svcm6ey6zpn05f0_tnp4o2.jpg",
    member_count: 733
  },
  {
    id: "test-band",
    band_key: "AACxtpAkbJ1RFR8rbKejDTjC",
    name: "테스트 밴드",
    cover: "https://coresos-phinf.pstatic.net/a/34g0j0/b_fa2Ud018adm10u2w62ocihzm_5ksoqj.png",
    member_count: 1
  },
  {
    id: "haksa-farm",
    band_key: "AACFA2XDkBJcbhte4h_whI82",
    name: "학사농장유기데이",
    cover: "https://coresos-phinf.pstatic.net/a/347ad8/4_7b5Ud018svcv4k4kbtyc4j2_uqz5bo.png",
    member_count: 2654
  }
];

export default function BandKeySelector({ userData, onKeyChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedBand, setSelectedBand] = useState(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // 현재 밴드 키로 선택된 밴드 찾기
  useEffect(() => {
    if (userData?.band_key) {
      const currentBand = BAND_KEYS.find(band => band.band_key === userData.band_key);
      setSelectedBand(currentBand || {
        band_key: userData.band_key,
        name: "Unknown Band",
        member_count: 0
      });
    }
  }, [userData?.band_key]);

  const handleBandSelect = async (band) => {
    setLoading(true);
    setIsOpen(false);
    
    try {
      const response = await fetch('/api/admin/update-band-key', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: userData.id,
          bandKey: band.band_key
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update band key');
      }

      const result = await response.json();
      
      if (result.success) {
        setSelectedBand(band);
        setSuccess(true);
        
        // 성공 메시지 자동 숨김
        setTimeout(() => setSuccess(false), 3000);
        
        // 상위 컴포넌트에 변경 사항 알림
        if (onKeyChange) {
          onKeyChange(band);
        }
      }
    } catch (error) {
      console.error('Error updating band key:', error);
      alert('밴드 키 변경에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">
          테스트 밴드 선택
        </h3>
        {success && (
          <div className="flex items-center text-green-600">
            <CheckIcon className="h-5 w-5 mr-2" />
            <span className="text-sm">변경 완료</span>
          </div>
        )}
      </div>

      <div className="bg-blue-50 rounded-lg p-4">
        <div className="flex">
          <InformationCircleIcon className="h-5 w-5 text-blue-400 mt-0.5 mr-3 flex-shrink-0" />
          <div className="text-sm text-blue-700">
            <p>테스트용으로 다른 밴드의 데이터를 확인하고 싶을 때 밴드 키를 변경할 수 있습니다.</p>
            <p className="mt-1 font-medium">현재 선택된 밴드의 게시물과 주문 데이터가 표시됩니다.</p>
          </div>
        </div>
      </div>

      <div className="relative">
        <button
          type="button"
          className="relative w-full bg-white border border-gray-300 rounded-lg shadow-sm pl-3 pr-10 py-3 text-left cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
          onClick={() => setIsOpen(!isOpen)}
          disabled={loading}
        >
          {selectedBand ? (
            <div className="flex items-center">
              <img
                src={selectedBand.cover}
                alt={selectedBand.name}
                className="h-8 w-8 rounded-full object-cover mr-3"
                onError={(e) => {
                  e.target.style.display = 'none';
                }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {selectedBand.name}
                </p>
                <p className="text-sm text-gray-500">
                  멤버 {selectedBand.member_count?.toLocaleString()}명
                </p>
              </div>
            </div>
          ) : (
            <span className="text-gray-500">밴드를 선택하세요</span>
          )}
          
          <span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
            {loading ? (
              <div className="animate-spin h-5 w-5 text-gray-400">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 4V2A10 10 0 0 0 2 12h2a8 8 0 0 1 8-8Z"/>
                </svg>
              </div>
            ) : (
              <ChevronDownIcon className="h-5 w-5 text-gray-400" />
            )}
          </span>
        </button>

        {isOpen && (
          <div className="absolute z-10 mt-1 w-full bg-white shadow-lg max-h-96 rounded-lg py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none">
            {BAND_KEYS.map((band) => (
              <button
                key={band.id}
                className="w-full text-left px-3 py-3 hover:bg-gray-50 focus:bg-gray-50 focus:outline-none"
                onClick={() => handleBandSelect(band)}
              >
                <div className="flex items-center">
                  <img
                    src={band.cover}
                    alt={band.name}
                    className="h-8 w-8 rounded-full object-cover mr-3"
                    onError={(e) => {
                      e.target.style.display = 'none';
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {band.name}
                    </p>
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-gray-500">
                        멤버 {band.member_count.toLocaleString()}명
                      </p>
                      {selectedBand?.band_key === band.band_key && (
                        <CheckIcon className="h-4 w-4 text-blue-600" />
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="bg-yellow-50 rounded-lg p-3">
        <div className="flex">
          <ExclamationTriangleIcon className="h-5 w-5 text-yellow-400 mt-0.5 mr-2 flex-shrink-0" />
          <p className="text-sm text-yellow-700">
            <strong>주의:</strong> 밴드 키 변경은 즉시 적용되며, 해당 밴드의 데이터만 표시됩니다.
          </p>
        </div>
      </div>
    </div>
  );
}