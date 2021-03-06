import firebase from "firebase";
import { JSX } from "preact";
import { useEffect, useState } from "preact/hooks";
import { route } from "preact-router";
import { useAuthState } from "react-firebase-hooks/auth";

import { FIRESTORE_KEY } from "../const/firestore-key";
import { auth, db } from "../infra/firebase";
import {
  FirestoreInvitationField,
  FirestoreUserField,
  SaveUser,
} from "../type/api";
import { createToken } from "../util/createToken";
import { getParam } from "../util/getParam";

export const useSignup = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState<string | undefined>(undefined);
  const [user, loading, error] = useAuthState(auth);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(
    undefined
  );
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (error) {
      setErrorMessage(
        "認証サービスにて不具合が発生しました。しばらくお待ちください。"
      );
    }
  }, [error]);

  useEffect(() => {
    const token = getParam("token", window.location.href);
    firebase
      .auth()
      .getRedirectResult()
      .then((result) => {
        const user = result.user;
        if (user === null) return;
        const promise0 = user
          .sendEmailVerification()
          .then(() => {
            // Email sent.
          })
          .catch((e) => {
            console.error(e);
            setErrorMessage("email の送信に失敗しました。");
          });
        const data: SaveUser = {
          name: user.displayName || null,
          image: user.photoURL || null,
          invitation: 3,
          invitationKey: createToken(),
          timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        };

        const uid = user.uid;

        if (token === undefined) {
          setErrorMessage("tokenがありません");
          return;
        }

        // 新規登録
        const promise1 = db
          .collection(FIRESTORE_KEY.USERS)
          .doc(uid)
          .set(data)
          .catch((e) => {
            console.error(e);
            throw new Error("firestore error");
          });

        // invitationの減少
        const promise2 = db
          .collection(FIRESTORE_KEY.USERS)
          .where("invitationKey", "==", token)
          .get()
          .then((querySnapshot) => {
            if (querySnapshot.size > 1) {
              console.error("same tokens");
            }
            querySnapshot.forEach(async (doc) => {
              const data: FirestoreUserField = doc.data() as any;
              // invitation logを作成
              const inv: FirestoreInvitationField = {
                from: doc.id,
                to: uid,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
              };
              db.collection(FIRESTORE_KEY.INVITATIONS)
                .add(inv)
                .catch((e) => {
                  console.error(e);
                });

              if (data.invitation - 1 < 0) {
                setErrorMessage("招待者の招待可能数の上限を超えました。");
                return;
              }
              await doc.ref.update({ invitation: data.invitation - 1 });
            });
          });
        Promise.all([promise0, promise1, promise2]).then(() => {
          route("/mypage", true);
        });
      })
      .catch((error) => {
        console.error(error);
      });
  }, []);

  useEffect(() => {
    const token = getParam("token", window.location.href);
    setToken(token || undefined);
  }, []);

  const handleSetEmail = (email: string) => {
    setEmail(email);
  };

  const handleSetPassword = (password: string) => {
    setPassword(password);
  };

  const handleSetToken = (e: JSX.TargetedEvent<HTMLInputElement, Event>) => {
    const password = (e.target as HTMLInputElement).value;
    setToken(password);
  };

  const handleClickGithub = () => {
    const provider = new firebase.auth.GithubAuthProvider();
    firebase.auth().signInWithRedirect(provider);
  };

  const handleSubmit = (e: JSX.TargetedEvent<HTMLFormElement, Event>) => {
    setSending(true);
    if (token === undefined) {
      setErrorMessage("招待トークンがありません。");
      return;
    }
    e.preventDefault();
    firebase
      .auth()
      .createUserWithEmailAndPassword(email, password)
      .then((user) => {
        if (!user.user) throw new Error("invalid user");
        const uid = user.user.uid;
        if (!user.user.email) throw new Error("invalid user");

        // 招待者のinvitationの減少
        const promise0 = db
          .collection(FIRESTORE_KEY.USERS)
          .where("invitationKey", "==", token)
          .get()
          .then((querySnapshot) => {
            if (querySnapshot.size === 0) {
              setErrorMessage("不正なトークンです。");
              return;
            }
            if (querySnapshot.size > 1) {
              console.error("same tokens");
            }
            querySnapshot.forEach(async (doc) => {
              const data: FirestoreUserField = doc.data() as any;
              // invitation logを作成
              const inv: FirestoreInvitationField = {
                from: doc.id,
                to: uid,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
              };
              db.collection(FIRESTORE_KEY.INVITATIONS)
                .add(inv)
                .catch((e) => {
                  console.error(e);
                });
              if (data.invitation - 1 < 0) {
                setErrorMessage("招待者の招待可能数の上限を超えました。");
                return;
              }
              await doc.ref.update({ invitation: data.invitation - 1 });
            });
          });

        // 新規登録
        const data: SaveUser = {
          name: user.user.displayName,
          image: user.user.photoURL,
          invitation: 3,
          invitationKey: createToken(),
          timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        };
        const promise1 = db
          .collection(FIRESTORE_KEY.USERS)
          .doc(uid)
          .set(data)
          .then(() => {
            setSending(false);
          })
          .catch(() => {
            setErrorMessage("ユーザー情報の登録に失敗しました。");
          });

        const promise2 = user.user
          .sendEmailVerification()
          .then(() => {
            // Email sent.
          })
          .catch((e) => {
            console.error(e);
            setErrorMessage("email の送信に失敗しました。");
          });

        Promise.all([promise0, promise1, promise2]).then(() => {
          route("/mypage", true);
        });
      })
      .catch((error) => {
        console.error(error);
        setErrorMessage(
          "認証に失敗しました。同一のアドレスをすでに登録していないか・8文字以上のパスワードを利用しているかを確認してください。"
        );
      });
  };

  const handleLogout = () => {
    auth.signOut();
  };

  return {
    email,
    handleSetEmail,
    password,
    handleSetPassword,
    handleSubmit,
    handleLogout,
    token,
    handleSetToken,
    handleClickGithub,
    user,
    loading,
    errorMessage,
    sending,
  };
};
