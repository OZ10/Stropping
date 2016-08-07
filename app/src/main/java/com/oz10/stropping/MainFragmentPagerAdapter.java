package com.oz10.stropping;

import android.support.v4.app.Fragment;
import android.support.v4.app.FragmentManager;
import android.support.v4.app.FragmentStatePagerAdapter;
import android.view.ViewGroup;

/**
 * Created by Austen on 02/08/2016.
 */
public class MainFragmentPagerAdapter extends FragmentStatePagerAdapter {
    private ShoppingListFragment _ShoppingListFragment;
    private IngredientsListFragment _IngredientsFragment;
    private RecipesFragment _RecipesListFragment;

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
                _ShoppingListFragment = (ShoppingListFragment) createdFragment;
                break;
            case 1:
                _IngredientsFragment = (IngredientsListFragment) createdFragment;
                break;
            case 2:
                _RecipesListFragment = (RecipesFragment) createdFragment;
                break;
        }
        return createdFragment;
    }

    public Object GetFragmentByIndex(int index){
        switch (index){
            case 0:
               if (_ShoppingListFragment != null) return _ShoppingListFragment;
            case 1:
                if (_IngredientsFragment != null) return _IngredientsFragment;
            case 2:
                if (_RecipesListFragment != null) return _RecipesListFragment;
        }
        return null;
    }
}
