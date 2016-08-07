package com.oz10.stropping;

import android.support.v4.app.Fragment;
import android.support.v4.app.FragmentManager;
import android.support.v4.app.FragmentStatePagerAdapter;
import android.view.ViewGroup;

/**
 * Created by Austen on 02/08/2016.
 */
public class MainFragmentPagerAdapter extends FragmentStatePagerAdapter {
    private ShoppingListFragment mShoppingListFragment;
    private IngredientsListFragment mIngredientsFragment;
    private Fragment mRecipesListFragment;

    public enum FragmentNames{
        ShoppingListFrag,
        IngredientsListFrag,
        RecipesFrag
    }

    public MainFragmentPagerAdapter(FragmentManager fm) {
        super(fm);
    }

    @Override
    public Fragment getItem(int position) {
        switch (position){
            case 0:
                return new ShoppingListFragment();
            case 1:
                return new IngredientsListFragment();
            case 2:
                return new RecipesFragment();
        }

        return null;
    }

    @Override
    public int getCount() {
        return 3;
    }

    @Override
    public Object instantiateItem(ViewGroup container, int position){
        Fragment createdFragment = (Fragment) super.instantiateItem(container, position);
        switch (position){
            case 0:
                mShoppingListFragment = (ShoppingListFragment) createdFragment;
                break;
            case 1:
                mIngredientsFragment = (IngredientsListFragment) createdFragment;
                break;
            case 2:
                mRecipesListFragment = (RecipesFragment) createdFragment;
                break;
        }
        return createdFragment;
    }

    public Object GetFragmentByIndex(int index){
        switch (index){
            case 0:
               if (mShoppingListFragment != null) return mShoppingListFragment;
            case 1:
                if (mIngredientsFragment != null) return mIngredientsFragment;
            case 2:
                if (mRecipesListFragment != null) return mRecipesListFragment;
        }
        return null;
    }
}
