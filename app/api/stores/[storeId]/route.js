import { NextResponse } from "next/server";

export async function GET(request, { params }) {
  try {
    const { storeId } = params;

    // TODO: 실제 데이터베이스 연동 시 이 부분을 수정해야 합니다.
    // 현재는 임시 데이터를 반환합니다.
    const mockStoreData = {
      id: storeId,
      name: "테스트 매장",
      address: "서울시 강남구 테스트로 123",
      bandURL: "https://band.us/test",
      bandId: "test_band_id",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      admins: [
        {
          id: "admin1",
          loginID: "testadmin",
          role: "admin",
          createdAt: new Date().toISOString(),
        },
      ],
    };

    return NextResponse.json({
      success: true,
      data: mockStoreData,
      message: "매장 정보를 성공적으로 조회했습니다.",
    });
  } catch (error) {
    console.error("매장 정보 조회 오류:", error);
    return NextResponse.json(
      {
        success: false,
        message: "매장 정보 조회 중 오류가 발생했습니다.",
        error: error.message,
      },
      { status: 500 }
    );
  }
}
