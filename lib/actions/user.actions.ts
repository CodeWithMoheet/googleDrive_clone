"use server";

// Import necessary utilities and configurations from local libraries and Appwrite SDK
import { createAdminClient, createSessionClient } from "@/lib/appwrite";
import { appwriteConfig } from "@/lib/appwrite/config";
import { Query, ID } from "node-appwrite";
import { parseStringify } from "@/lib/utils";
import { cookies } from "next/headers";
import { avatarPlaceholderUrl } from "@/constants";
import { redirect } from "next/navigation";

// 1. Helper function to fetch a user from the database using their email
const getUserByEmail = async (email: string) => {
    const { databases } = await createAdminClient();

    const result = await databases.listDocuments(
        appwriteConfig.databaseId,
        appwriteConfig.usersCollectionId,
        [Query.equal("email", email)],
    )
    return result.total > 0 ? result.documents[0] : null;
}

// 2. Generic error handler to log and re-throw the error
const handleError = (error: unknown, message: string) => {
    console.error(error, message);
    throw error;
}

// 3. Function to send a One-Time Password (OTP) to a user's email using Appwrite's email token
export const sendEmailOTP = async ({ email }: { email: string }) => {
    const { account } = await createAdminClient();

    try {
        const session = await account.createEmailToken(ID.unique(), email);
        return session.userId;
    } catch (error) {
        handleError(error, "Failed to send OTP to email");
    }
}

// 4. Function to create a new user account if one doesn't already exist
export const createAccount = async ({ fullName, email}:{ fullName: string, email: string }) => {
  // 5. Check if the user already exists by email
const existingUser = await getUserByEmail(email);
  // 6. Send an email OTP and get the accountId
const accountId = await sendEmailOTP({ email });
if(!accountId) throw new Error("Failed to send OTP to email");
  // 7. If the user doesn't exist, create a new user in the database

  if (!existingUser){
    const { databases } = await createAdminClient();

    await databases.createDocument(

        appwriteConfig.databaseId,
        appwriteConfig.usersCollectionId,
        ID.unique(),
        {
            fullName,
            email,
            accountId,
            avatar: avatarPlaceholderUrl,
          
        },
    )

  }
  // 8. Return the new or existing accountId in a serialized format
    return parseStringify({ accountId });

}

// 9. Function to verify the user's OTP password and set session cookie
export const verifySecret = async ({ accountId, password }: { accountId: string; password: string }) => {
  try {
    const { account } = await createAdminClient();

    // 10. Create a session using accountId and OTP password
    const session = await account.createSession(accountId, password);

    // 11. Set a secure cookie with the session secret
    (await cookies()).set("appwrite-session", session.secret, {
      path: "/",
      httpOnly: true,
      sameSite: "strict",
      secure: true,
    });

    // 12. Return the session ID in stringified form
    return parseStringify({ sessionId: session.$id });
  } catch (error) {
    handleError(error, "Failed to verify OTP password");
  }
};

// 13. Function to fetch the currently logged-in user's full document data
export const getCurrentUser = async () => {
  try {
    const { databases, account } = await createSessionClient();

    const result = await account.get();

    const user = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.usersCollectionId,
      [Query.equal("accountId", result.$id)],
    );

    if (user.total <= 0) return null;

    return parseStringify(user.documents[0]);
  } catch (error) {
    console.log(error);
  }
};

  // 17. Function to log out the currently logged-in user and delete session cookie
export const signOutUser = async () => {
    const { account } = await createSessionClient();
  
    try {
      await account.deleteSession("current");
      (await cookies()).delete("appwrite-session");
    } catch (error) {
      handleError(error, "Failed to sign out user");
    } finally {
      // 18. Redirect to sign-in page after logout
      redirect("/sign-in");
    }
  };

  // 19. Function to sign in user by sending OTP if they exist
export const signInUser = async ({ email }: { email: string }) => {
    try {
      const existingUser = await getUserByEmail(email);
  
      // 20. If user exists, send email OTP and return accountId
      if (existingUser) {
        await sendEmailOTP({ email });
        return parseStringify({ accountId: existingUser.accountId });
      }
  
      // Return null accountId and error if user not found
      return parseStringify({ accountId: null, error: "User not found" });
    } catch (error) {
      handleError(error, "Failed to sign in user");
    }
  };
  