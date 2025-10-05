# GEMINI.md

## Project Overview

This is a Next.js web application that serves as a dashboard for an e-commerce business. The application is built with Next.js, React, and Tailwind CSS, and it uses Supabase for its backend.

A key feature of the application is its integration with a service called "Band", which appears to be a platform for social commerce. The application fetches posts from "Band", processes them to extract product and order information, and then displays this information in the dashboard.

The application has a sophisticated system for managing "Band" API keys and for routing "Band" API requests to different Edge Functions for better performance and to handle rate limits.

The codebase is written in JavaScript and includes comments in Korean.

## Building and Running

The project uses `npm` for package management. The following scripts are available:

*   `npm run dev`: Starts the development server with Turbopack.
*   `npm run build`: Creates a production build of the application.
*   `npm run start`: Starts the production server.
*   `npm run lint`: Lints the codebase using ESLint.

To run the application, you will need to have Node.js and npm installed. You will also need to create a `.env.local` file with the following environment variables:

*   `NEXT_PUBLIC_SUPABASE_URL`: The URL of your Supabase project.
*   `NEXT_PUBLIC_SUPABASE_ANON_KEY`: The anonymous key for your Supabase project.

## Development Conventions

*   **Framework:** The application is built with Next.js and uses the App Router.
*   **Language:** The codebase is written in JavaScript.
*   **Styling:** The application uses Tailwind CSS for styling.
*   **Backend:** The application uses Supabase for its backend, including database and authentication.
*   **API:** The application interacts with the "Band" API to fetch data. It has a system for managing API keys and for routing requests to different Edge Functions.
*   **State Management:** The application uses React hooks and SWR for state management.
*   **Linting:** The application uses ESLint for linting.
*   **Comments:** The code is well-commented, with comments written in Korean.
