// app/api/start-band-crawl/route.js

import { NextResponse } from "next/server";
import BandPostsApi from "../../../services/crawler/band.posts.api"; // *** Verify this path ***
import { createClient } from "@supabase/supabase-js";
import { updateTaskStatusInDB } from "../../../services/crawler/band.utils"; // *** Verify this path ***

// --- Supabase Client Initialization ---
// Move to a shared config if used in multiple places
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// --- Logger (Mimicking the style) ---
const logger = {
  info: (...args) => console.log("[INFO] [Crawl Route]", ...args),
  warn: (...args) => console.warn("[WARN] [Crawl Route]", ...args),
  error: (...args) => console.error("[ERROR] [Crawl Route]", ...args),
};

// --- Helper to Create Task ---
// (Keep the createTask function as previously defined)
async function createTask(userId, bandKey, options) {
  if (!supabase) {
    logger.error("Supabase client not initialized for createTask.");
    return null;
  }
  const taskTable = "crawl_tasks"; // Ensure this table exists
  logger.debug(
    `Attempting to create task in '${taskTable}' for user ${userId}`
  );
  try {
    const { data, error } = await supabase
      .from(taskTable)
      .insert({
        user_id: userId,
        band_key: bandKey,
        status: "pending",
        progress: 0,
        details: "크롤링 작업 생성됨",
        options: options,
      })
      .select() // Return created task
      .single();

    if (error) throw error;
    logger.info(`New task created with ID: ${data?.task_id}`);
    return data?.task_id;
  } catch (error) {
    logger.error(`Failed to create task: ${error.message}`);
    return null;
  }
}

/**
 * Band 크롤링 시작 처리 API
 * @param {Request} request - 요청 객체
 */
export async function POST(request) {
  let taskId = null; // Define taskId here to be accessible in catch/finally if needed

  try {
    const body = await request.json();
    const {
      userId,
      bandKey,
      daysLimit = 5,
      fetchComments = true,
      processWithAI = true,
    } = body;

    // --- 1. Input Validation ---
    if (!userId || !bandKey) {
      logger.warn("Validation failed: userId or bandKey missing.", body);
      return NextResponse.json(
        { success: false, message: "사용자 ID와 Band Key는 필수입니다." },
        { status: 400 }
      );
    }
    logger.info("크롤링 시작 요청 수신:", {
      userId,
      bandKey,
      daysLimit,
      fetchComments,
      processWithAI,
    });

    // --- 2. Get Access Token (Server-side) ---
    const accessToken = process.env.BAND_ACCESS_TOKEN;
    if (!accessToken) {
      logger.error(
        "보안 오류: BAND_ACCESS_TOKEN 환경 변수가 서버에 설정되지 않았습니다."
      );
      // Don't expose detailed server config errors to the client
      return NextResponse.json(
        {
          success: false,
          message: "서버 설정 오류입니다. 관리자에게 문의하세요.",
        },
        { status: 500 }
      );
    }
    logger.info("서버에서 Access Token 확인 완료.");

    // --- 3. Create Task ID (Optional) ---
    // This helps track the background job
    try {
      taskId = await createTask(userId, bandKey, {
        daysLimit,
        fetchComments,
        processWithAI,
      });
      if (!taskId) {
        logger.warn(
          "DB에 작업 ID를 생성하지 못했지만, 크롤링은 계속 진행합니다."
        );
        // Decide if taskId is absolutely mandatory or not
      } else {
        logger.info(`작업 ID [${taskId}] 생성 완료.`);
      }
    } catch (taskError) {
      logger.error(
        `작업 생성 중 DB 오류: ${taskError.message}. 크롤링 시작 불가.`
      );
      return NextResponse.json(
        { success: false, message: "작업 생성 중 오류 발생." },
        { status: 500 }
      );
    }

    // --- 4. Instantiate and Initiate the Crawler (Internal "Backend Call") ---
    // This part replaces the `fetch` call in the login example, as the logic runs here.
    const bandCrawler = new BandPostsApi(bandKey, accessToken, {
      supabase: supabase, // Pass client if needed internally
      // aiService: yourAiServiceInstance // Pass AI service if needed
    });

    // Set status update callback *before* starting the crawl, if used by the crawler
    // bandCrawler.setOnStatusUpdate((status, message, progress) => {
    //     // This callback would be invoked by the crawler *during* its execution
    //     console.log(`[Crawler Callback - Task ${taskId}] Status: ${status}, Msg: ${message}, Progress: ${progress}`);
    //     // You might update the DB task status here as well, but be mindful of async nature
    //     if (taskId) {
    //         updateTaskStatusInDB(taskId, status, message, progress).catch(err => logger.error(`Callback DB update error: ${err.message}`));
    //     }
    // });

    // --- 5. Start the crawl asynchronously (Fire-and-Forget) ---
    logger.info(`[Task ${taskId}] 백그라운드 크롤링 작업 시작 호출...`);
    // Don't await this promise. Let it run in the background.
    bandCrawler
      .crawlPostsAndCommentsApi(
        userId,
        parseInt(daysLimit, 10),
        fetchComments,
        processWithAI,
        taskId // Pass taskId for internal updates
      )
      .then(async (result) => {
        // Add async here if using await inside .then
        logger.info(
          `[Task ${taskId}] 백그라운드 크롤링 완료. Success: ${result.success}`
        );
        // Update task status to final state in DB (completed or failed)
        if (taskId && supabase) {
          const finalStatus = result.success ? "completed" : "failed";
          const finalMessage = result.success
            ? "크롤링 완료"
            : `크롤링 실패: ${result.error || "알 수 없는 오류"}`;
          await updateTaskStatusInDB(taskId, finalStatus, finalMessage, 100); // Use await here
        }
      })
      .catch(async (error) => {
        // Add async here if using await inside .catch
        logger.error(
          `[Task ${taskId}] 백그라운드 크롤링 중 심각한 오류 발생: ${error.message}`,
          error.stack
        );
        // Update task status to failed in DB
        if (taskId && supabase) {
          await updateTaskStatusInDB(
            taskId,
            "failed",
            `백그라운드 처리 오류: ${error.message}`,
            100
          ); // Use await here
        }
      });

    // --- 6. Respond Immediately to Frontend ---
    logger.info(`[Task ${taskId}] 프론트엔드에 작업 시작 응답 전송.`);
    return NextResponse.json({
      success: true,
      message: "Band 크롤링 작업이 백그라운드에서 시작되었습니다.",
      taskId: taskId, // Send taskId back to client
    });
  } catch (error) {
    // Catch synchronous errors during setup (parsing, validation, token check, task creation, initiating crawl)
    logger.error("크롤링 시작 API 처리 중 오류:", error);
    // Optionally update task status to failed if taskId was created before the error
    if (taskId && supabase) {
      try {
        await updateTaskStatusInDB(
          taskId,
          "failed",
          `시작 오류: ${error.message}`,
          0
        );
      } catch (dbUpdateError) {
        logger.error(
          `[Task ${taskId}] 시작 오류 후 DB 상태 업데이트 실패: ${dbUpdateError.message}`
        );
      }
    }
    return NextResponse.json(
      {
        success: false,
        message: error.message || "크롤링 작업 시작 중 오류가 발생했습니다.",
      },
      { status: 500 } // Internal Server Error for unexpected issues
    );
  }
}

// --- Other HTTP Methods (Optional but good practice) ---
export async function GET(request) {
  logger.warn(`GET 요청 수신됨 - 허용되지 않는 메소드: ${request.url}`);
  return NextResponse.json(
    {
      success: false,
      message: "허용되지 않는 메소드입니다. POST를 사용하세요.",
    },
    { status: 405 } // Method Not Allowed
  );
}
// Add handlers for PUT, DELETE, etc. if needed, returning 405
